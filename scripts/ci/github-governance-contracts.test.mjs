import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

const REQUIRED_CHECKS = [
  'validation-surface',
  'audit',
  'e2e',
  'pnpm-audit',
  'gitleaks',
  'pilot-gate',
  'pr-finalizer',
  'commitlint',
];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readWorkflow(relativePath) {
  return yaml.load(read(relativePath));
}

function escapeRegexLiteral(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, String.raw`\$&`);
}

test('branch-protection documentation and PR template list current governance checks', () => {
  const protectionDoc = read('docs/BRANCH_PROTECTION_MULTI_AGENT.md');
  const prTemplate = read('.github/pull_request_template.md');

  for (const checkName of REQUIRED_CHECKS) {
    const escapedName = escapeRegexLiteral(checkName);
    assert.match(protectionDoc, new RegExp(`\`${escapedName}\``));
    assert.match(prTemplate, new RegExp(`\`${escapedName}\``));
  }
  assert.doesNotMatch(protectionDoc, /\`(?:CodeQL|Analyze)/);
  assert.doesNotMatch(prTemplate, /\`(?:CodeQL|Analyze)/);

  assert.match(prTemplate, /@codex review/);
  assert.match(prTemplate, /pnpm pr:review-ready -- <PR_NUMBER>/);
  assert.doesNotMatch(protectionDoc, /multi-agent-dry-run/);
  assert.match(protectionDoc, /Codex GitHub review is\s+expected when enabled/);
  assert.match(protectionDoc, /Do not require `static`, `unit`, or `e2e-gate` globally/);
  assert.match(protectionDoc, /Do not require\s+`SonarCloud Code Analysis` globally/);
});

test('governance report and terminal evaluator consume the canonical delivery manifest', () => {
  const packageJson = JSON.parse(read('package.json'));
  const reportScript = read('scripts/github-pr-governance-report.mjs');
  const contract = JSON.parse(read('scripts/ci/pr-delivery-contract.json'));

  assert.equal(
    packageJson.scripts['pr:governance:report'],
    'node scripts/github-pr-governance-report.mjs'
  );
  assert.equal(packageJson.scripts['pr:review-ready'], 'bash scripts/pr-review-ready.sh');
  for (const context of ['SonarCloud Code Analysis', 'CodeQL']) {
    assert.ok(contract.deliveryPrerequisites.some(item => item.context === context));
  }
  for (const author of ['copilot-pull-request-reviewer', 'chatgpt-codex-connector']) {
    assert.ok(contract.feedbackAuthors.includes(author));
  }
  assert.match(reportScript, /monitoredChecks/);
  assert.match(reportScript, /evaluateDeliveryChecks/);
  assert.match(reportScript, /verifyFeedback/);
  assert.match(reportScript, /actionableFeedbackPatterns/);
  assert.doesNotMatch(reportScript, /PR_REVIEW_READY_ALLOW_MISSING_COPILOT/);
  assert.doesNotMatch(reportScript, /request Copilot review/);
  assert.match(reportScript, /\^\\d\+\$/);
  assert.match(reportScript, /pr-delivery-contract\.json/);
  assert.match(reportScript, /delivery-gate/);
  assert.doesNotMatch(reportScript, /void contract/u);

  assert.match(reportScript, /providerRequiredContexts/);
  assert.match(reportScript, /deliveryPrerequisites/);
});

test('relative governance-report invocation executes instead of silently succeeding', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/github-pr-governance-report.mjs', 'invalid'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Usage:/u);
});

test('governance report honors only repository-bound contract overrides', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-contract-'));
  const contractPath = path.join(temporary, 'invalid-contract.json');
  fs.writeFileSync(contractPath, '{}');
  try {
    for (const [source, pattern] of [
      [contractPath, /delivery contract escaped repository/u],
      [path.join(rootDir, 'package.json'), /delivery contract keys mismatch/u],
    ]) {
      const result = spawnSync(
        process.execPath,
        ['scripts/github-pr-governance-report.mjs', 'invalid'],
        {
          cwd: rootDir,
          encoding: 'utf8',
          env: { ...process.env, PR_DELIVERY_CONTRACT: source },
        }
      );
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}\n${result.stderr}`, pattern);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('review-ready script composes finalizer and strict governance report', () => {
  const script = read('scripts/pr-review-ready.sh');

  assert.match(script, /PR_FINALIZER_SKIP_CHECK_POLLING/);
  assert.match(script, /\[\[ "\$\{1:-\}" == "--" \]\]/);
  assert.match(script, /shift/);
  assert.match(script, /GITHUB_EVENT_PATH="" bash scripts\/pr-finalizer\.sh/);
  assert.match(script, /boundary-diff-report\.mjs/);
  assert.match(
    script,
    /gh api --paginate "repos\/\$\{repo\}\/pulls\/\$\{pr_number\}\/files\?per_page=100"/
  );
  assert.match(script, /\.\[\]\.filename/);
  assert.match(script, /Phase C no-touch files changed/);
  assert.match(script, /return 1/);
  assert.match(script, /node scripts\/github-pr-governance-report\.mjs --strict/);
  assert.doesNotMatch(script, /PR_REVIEW_READY_ALLOW_MISSING_COPILOT/);
  assert.match(script, /pr-delivery-contract\.json/);
  assert.match(script, /phase-c-no-touch-authorized/);
  assert.match(script, /PR_REVIEW_READY_ALLOW_NO_TOUCH/);
  assert.match(script, /PR_REVIEW_READY_NO_TOUCH_REASON/);
  assert.match(script, /resolve_pr_number/);
  assert.match(script, /GITHUB_EVENT_PATH/);
  assert.match(script, /gh pr view --json number/);
  assert.match(script, /has_no_touch_authorization/);
  assert.match(script, /pr-review-ready failed: invalid delivery contract/u);
});

test('Codex review prompt names current billing provider', () => {
  const prompt = read('.github/codex/prompts/review.md');

  assert.match(prompt, /Paddle is the only V3 pilot billing provider/);
  assert.doesNotMatch(prompt, /Stripe is not part of V3 pilot flows/);
});

test('repo workflows still materialize documented required check names', () => {
  const ci = readWorkflow('.github/workflows/ci.yml');
  const e2ePr = readWorkflow('.github/workflows/e2e-pr.yml');
  const pilotGate = readWorkflow('.github/workflows/pilot-gate.yml');
  const security = readWorkflow('.github/workflows/security.yml');
  const secretScan = readWorkflow('.github/workflows/secret-scan.yml');
  const finalizer = readWorkflow('.github/workflows/pr-finalizer.yml');
  const commitlint = readWorkflow('.github/workflows/commitlint.yml');

  for (const jobName of ['validation-surface', 'audit', 'static', 'unit', 'e2e-gate']) {
    assert.ok(ci.jobs[jobName], jobName);
  }
  assert.ok(e2ePr.jobs.e2e);
  assert.ok(pilotGate.jobs['pilot-gate']);
  assert.ok(security.jobs['pnpm-audit']);
  assert.ok(secretScan.jobs.gitleaks);
  assert.ok(finalizer.jobs['pr-finalizer']);
  assert.ok(commitlint.jobs.commitlint);
});
