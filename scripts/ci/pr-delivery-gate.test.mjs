import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateDeliverySnapshot, validateDeliveryContract } from './pr-delivery-gate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gateSource = fs.readFileSync(path.join(root, 'scripts/ci/pr-delivery-gate.mjs'), 'utf8');
const contract = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/ci/pr-delivery-contract.json'), 'utf8')
);
const B = '1'.repeat(40);
const H = '2'.repeat(40);
const T = '3'.repeat(40);
const TREE = '4'.repeat(40);

const check = (context, appId, overrides = {}) => ({
  id: Number(`${appId}${context.length}`),
  context,
  appId,
  headSha: H,
  status: 'completed',
  conclusion: 'success',
  runId: Number(`${context.length}01`),
  runAttempt: 1,
  annotations: [],
  ...overrides,
});

function checksFor(currentContract = contract) {
  return currentContract.deliveryPrerequisites
    .filter(item => item.requirement === 'required')
    .map(item => check(item.context, item.appId));
}

function snapshot(overrides = {}) {
  return {
    expected: { base: B, head: H, testedMerge: T },
    pull: { state: 'open', baseSha: B, headSha: H },
    commits: {
      [B]: { tree: '5'.repeat(40), parents: [] },
      [H]: { tree: TREE, parents: [B] },
      [T]: { tree: TREE, parents: [B, H] },
    },
    validationSurface: { shouldRun: true, reason: 'runtime_sensitive_surface' },
    checks: checksFor(),
    feedback: {
      headSha: H,
      disposedReviewIds: [],
      pagination: {
        checks: true,
        annotations: true,
        reviews: true,
        issueComments: true,
        reviewComments: true,
        threads: true,
      },
      unresolvedThreads: [],
      pendingReviewers: [],
      reviews: [],
      issueComments: [],
      reviewComments: [],
    },
    ...overrides,
  };
}

test('contract has three acyclic sets and excludes the delivery gate from every input set', () => {
  assert.equal(validateDeliveryContract(contract), contract);
  const missingDeliveryApp = structuredClone(contract);
  delete missingDeliveryApp.deliveryContext.appId;
  assert.throws(() => validateDeliveryContract(missingDeliveryApp), /delivery context/iu);
  const extraException = structuredClone(contract);
  extraException.deliveryPrerequisites[0].annotationPolicy = 'conclusion-only';
  assert.throws(() => validateDeliveryContract(extraException), /annotation policy/iu);
  assert.deepEqual(
    contract.providerRequiredContexts.map(item => item.context),
    [
      'audit',
      'e2e',
      'pnpm-audit',
      'gitleaks',
      'pilot-gate',
      'validation-surface',
      'pr-finalizer',
      'commitlint',
    ]
  );
  assert.ok(contract.finalizerLeafPrerequisites.every(item => item.context !== 'pr-finalizer'));
  for (const set of [
    contract.finalizerLeafPrerequisites,
    contract.deliveryPrerequisites,
    contract.providerRequiredContexts,
  ]) {
    assert.ok(set.every(item => item.context !== contract.deliveryContext.context));
  }
  assert.ok(contract.deliveryPrerequisites.some(item => item.context === 'pr-finalizer'));
});

test('runtime event input uses the shared trusted-runner file boundary', () => {
  assert.match(gateSource, /readTrustedRunnerFile\(process\.env\.GITHUB_EVENT_PATH\)/u);
  assert.doesNotMatch(gateSource, /readFileSync\(eventPath/u);
});

test('a complete same-head snapshot with exact B/H/T and success conclusions passes', () => {
  const result = evaluateDeliverySnapshot(contract, snapshot());
  assert.equal(result.ok, true);
  assert.equal(result.head, H);
  assert.equal(result.testedTree, TREE);
});

for (const conclusion of [
  'failure',
  'cancelled',
  'neutral',
  'skipped',
  'timed_out',
  'action_required',
]) {
  test(`required context conclusion ${conclusion} fails closed`, () => {
    const current = snapshot();
    current.checks[0].conclusion = conclusion;
    assert.throws(() => evaluateDeliverySnapshot(contract, current), new RegExp(conclusion, 'iu'));
  });
}

test('missing, pending, stale-head, wrong-app, and duplicate current attempts fail closed', () => {
  const cases = [
    { mutate: value => value.checks.shift(), pattern: /missing/u },
    { mutate: value => (value.checks[0].status = 'in_progress'), pattern: /pending/u },
    { mutate: value => (value.checks[0].headSha = '9'.repeat(40)), pattern: /stale-head/u },
    { mutate: value => (value.checks[0].appId = 1), pattern: /wrong-app/u },
    {
      mutate: value => value.checks.push({ ...value.checks[0], id: 999 }),
      pattern: /duplicate/u,
    },
  ];
  for (const { mutate, pattern } of cases) {
    const current = snapshot();
    mutate(current);
    assert.throws(() => evaluateDeliverySnapshot(contract, current), pattern);
  }
});

test('the newest run attempt is authoritative and an older success cannot mask its failure', () => {
  const current = snapshot();
  const older = current.checks[0];
  older.runAttempt = 1;
  current.checks.push({ ...older, id: 999, runAttempt: 2, conclusion: 'failure' });
  assert.throws(() => evaluateDeliverySnapshot(contract, current), /failure/u);

  current.checks.at(-1).conclusion = 'success';
  older.conclusion = 'failure';
  assert.equal(evaluateDeliverySnapshot(contract, current).ok, true);
});

test('validation-surface skips are explicit and only allowed for non-product-only PRs', () => {
  const current = snapshot({
    validationSurface: { shouldRun: false, reason: 'non_product_only_pr' },
  });
  for (const item of contract.deliveryPrerequisites.filter(item => item.skipWhen)) {
    const target = current.checks.find(entry => entry.context === item.context);
    target.conclusion = 'skipped';
  }
  assert.equal(evaluateDeliverySnapshot(contract, current).ok, true);

  current.validationSurface = { shouldRun: true, reason: 'runtime_sensitive_surface' };
  assert.throws(() => evaluateDeliverySnapshot(contract, current), /skipped/u);
});

test('optional and companion generator checks cannot mask declared failures or bad annotations', () => {
  assert.equal(evaluateDeliverySnapshot(contract, snapshot()).ok, true);
  const companion = snapshot();
  companion.checks.push(check('Analyze (actions)', 57789));
  assert.equal(evaluateDeliverySnapshot(contract, companion).ok, true);

  const annotated = snapshot();
  annotated.checks[0].annotations = [{ level: 'warning', message: 'action required' }];
  assert.throws(() => evaluateDeliverySnapshot(contract, annotated), /annotation/u);

  const reportedAudit = snapshot();
  const pnpmAudit = reportedAudit.checks.find(item => item.context === 'pnpm-audit');
  pnpmAudit.annotations = [{ level: 'failure', message: 'non-blocking moderate report' }];
  assert.equal(evaluateDeliverySnapshot(contract, reportedAudit).ok, true);
  pnpmAudit.conclusion = 'failure';
  assert.throws(() => evaluateDeliverySnapshot(contract, reportedAudit), /pnpm-audit conclusion/iu);
});

test('provider contract drift, incomplete pagination, and unresolved current-head feedback fail closed', () => {
  const drift = structuredClone(contract);
  drift.providerRequiredContexts.pop();
  assert.throws(() => validateDeliveryContract(drift), /provider set mismatch/iu);

  const incomplete = snapshot();
  incomplete.feedback.pagination.threads = false;
  assert.throws(() => evaluateDeliverySnapshot(contract, incomplete), /pagination/u);

  const unresolved = snapshot();
  unresolved.feedback.unresolvedThreads.push({ url: 'https://example.invalid/thread' });
  assert.throws(() => evaluateDeliverySnapshot(contract, unresolved), /unresolved/u);

  const summary = snapshot();
  summary.feedback.reviews.push({
    id: 4001,
    author: 'copilot-pull-request-reviewer[bot]',
    commitId: H,
    state: 'COMMENTED',
    body: '<summary>Suppressed comments (1)</summary> Previously missed (1)',
    submittedAt: '2026-08-23T00:00:00Z',
  });
  assert.equal(evaluateDeliverySnapshot(contract, summary).ok, true);

  summary.feedback.reviews.push({
    id: 4002,
    author: 'copilot-pull-request-reviewer[bot]',
    commitId: H,
    state: 'COMMENTED',
    body: 'No additional findings.',
    submittedAt: '2026-08-23T00:01:00Z',
  });
  assert.equal(evaluateDeliverySnapshot(contract, summary).ok, true);

  const requested = snapshot();
  requested.feedback.reviews.push(
    {
      author: 'human-reviewer',
      commitId: H,
      state: 'CHANGES_REQUESTED',
      body: '',
      submittedAt: '2026-08-23T00:00:00Z',
    },
    {
      author: 'human-reviewer',
      commitId: H,
      state: 'COMMENTED',
      body: 'Follow-up detail.',
      submittedAt: '2026-08-23T00:01:00Z',
    }
  );
  assert.throws(() => evaluateDeliverySnapshot(contract, requested), /changes-requested/u);

  const securityReview = snapshot();
  securityReview.feedback.reviews.push({
    author: 'github-advanced-security[bot]',
    commitId: H,
    state: 'COMMENTED',
    body: '',
    submittedAt: '2026-08-23T00:00:00Z',
  });
  assert.equal(evaluateDeliverySnapshot(contract, securityReview).ok, true);

  const unknownBot = snapshot();
  unknownBot.feedback.issueComments.push({
    author: 'github-code-quality[bot]',
    body: 'No additional findings.',
    createdAt: '2026-08-23T00:00:00Z',
  });
  assert.equal(evaluateDeliverySnapshot(contract, unknownBot).ok, true);
  unknownBot.feedback.issueComments.push({
    author: 'unregistered-reviewer[bot]',
    body: 'clean',
    createdAt: '2026-08-23T00:00:00Z',
  });
  assert.throws(() => evaluateDeliverySnapshot(contract, unknownBot), /unknown generator/u);

  const inline = snapshot();
  inline.feedback.reviewComments.push({
    author: 'chatgpt-codex-connector[bot]',
    commitId: H,
    body: 'P1 finding: current-head inline defect',
    createdAt: '2026-08-23T00:00:00Z',
    resolved: false,
  });
  assert.throws(() => evaluateDeliverySnapshot(contract, inline), /actionable feedback/u);

  inline.feedback.reviewComments[0].resolved = true;
  assert.equal(evaluateDeliverySnapshot(contract, inline).ok, true);

  const staleInline = snapshot();
  staleInline.feedback.reviewComments.push({
    author: 'chatgpt-codex-connector[bot]',
    commitId: '9'.repeat(40),
    body: 'P1 finding: stale inline defect',
    createdAt: '2026-08-23T00:00:00Z',
    resolved: false,
  });
  assert.equal(evaluateDeliverySnapshot(contract, staleInline).ok, true);
});

test('mixed head snapshots and invalid tested merge topology fail closed', () => {
  const mixed = snapshot();
  mixed.feedback.headSha = '9'.repeat(40);
  assert.throws(() => evaluateDeliverySnapshot(contract, mixed), /mixed-head/u);

  const invalidMerge = snapshot();
  invalidMerge.commits[T].parents = [B];
  assert.throws(() => evaluateDeliverySnapshot(contract, invalidMerge), /parents/u);
});
