#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { isDirectInvocation } from './ci/pr-delivery-api.mjs';

const DELIVERY_CONTRACT = JSON.parse(
  fs.readFileSync(new URL('./ci/pr-delivery-contract.json', import.meta.url), 'utf8')
);
const REQUIRED_CHECKS = [
  ...DELIVERY_CONTRACT.providerRequiredContexts.map(item => item.context),
  'delivery-gate',
];
const MONITORED_CHECKS = DELIVERY_CONTRACT.deliveryPrerequisites
  .filter(item => item.classification !== 'provider')
  .map(item => item.context);
const SUCCESS_STATES = new Set(['SUCCESS', 'COMPLETED/SUCCESS']);
const ACTIONABLE_FEEDBACK_SOURCES = [
  String.raw`Suppressed comments\s*\([1-9]\d*\)`,
  String.raw`Previously missed\s*\([1-9]\d*\)`,
  String.raw`badge/P[0-2](?:-|\b)`,
  String.raw`\bP[0-2]\s*(?:finding|issue|:|-)`,
];
const ACTIONABLE_FEEDBACK_PATTERNS = ACTIONABLE_FEEDBACK_SOURCES.map(
  source => new RegExp(source, 'iu')
);
const GH_BINARY_CANDIDATES = ['/usr/bin/gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh'];
const compareText = (left, right) => left.localeCompare(right);
const CONTRACT_KEYS =
  'schemaVersion,repository,deliveryContext,finalizerLeafPrerequisites,providerRequiredContexts,deliveryPrerequisites,generatorAppIds,feedbackAuthors,actionableFeedbackPatterns,quiescenceMs'.split(
    ','
  );
const SPEC_KEYS = 'context,appId,classification,requirement,skipWhen,finalConclusions'.split(',');
function gateFail(message) {
  throw new Error(message);
}
function exactKeys(value, keys, label) {
  if (
    JSON.stringify(Object.keys(value ?? {}).sort(compareText)) !==
    JSON.stringify([...keys].sort(compareText))
  ) {
    gateFail(label + ' keys mismatch');
  }
}
function uniqueContexts(items, label) {
  const valid = item =>
    item &&
    typeof item.context === 'string' &&
    item.context &&
    Number.isSafeInteger(item.appId) &&
    item.appId > 0;
  if (
    !Array.isArray(items) ||
    items.some(item => !valid(item)) ||
    new Set(items.map(item => item.context)).size !== items.length
  ) {
    gateFail(label + ' identity mismatch');
  }
}
export function validateDeliveryContract(contract) {
  exactKeys(contract, CONTRACT_KEYS, 'delivery contract');
  if (
    contract.schemaVersion !== 1 ||
    contract.repository !== 'interdomestik/interdomestik' ||
    contract.deliveryContext?.context !== 'delivery-gate'
  )
    gateFail('delivery contract mismatch');
  uniqueContexts(contract.finalizerLeafPrerequisites, 'finalizer prerequisites');
  uniqueContexts(contract.providerRequiredContexts, 'provider contexts');
  uniqueContexts(contract.deliveryPrerequisites, 'delivery prerequisites');
  for (const item of contract.deliveryPrerequisites) {
    exactKeys(item, SPEC_KEYS, 'delivery prerequisite ' + item.context);
    if (
      !['provider', 'validation-surface', 'generator'].includes(item.classification) ||
      !['required', 'optional'].includes(item.requirement) ||
      JSON.stringify(item.finalConclusions) !== '["success"]'
    ) {
      gateFail('delivery prerequisite ' + item.context + ' mismatch');
    }
  }
  const sets = [
    contract.finalizerLeafPrerequisites,
    contract.providerRequiredContexts,
    contract.deliveryPrerequisites,
  ];
  if (
    sets.some(items => items.some(item => item.context === 'delivery-gate')) ||
    contract.finalizerLeafPrerequisites.some(item => item.context === 'pr-finalizer')
  ) {
    gateFail('delivery contract creates a cycle');
  }
  const provider = contract.providerRequiredContexts.map(item => item.context).sort(compareText);
  const declared = contract.deliveryPrerequisites
    .filter(item => item.classification === 'provider')
    .map(item => item.context)
    .sort(compareText);
  if (JSON.stringify(provider) !== JSON.stringify(declared) || !declared.includes('pr-finalizer')) {
    gateFail('provider set mismatch');
  }
  if (
    !Array.isArray(contract.generatorAppIds) ||
    !Array.isArray(contract.feedbackAuthors) ||
    !Number.isSafeInteger(contract.quiescenceMs) ||
    contract.quiescenceMs !== 20000 ||
    JSON.stringify(contract.actionableFeedbackPatterns) !==
      JSON.stringify(ACTIONABLE_FEEDBACK_SOURCES)
  ) {
    gateFail('generator or quiescence contract mismatch');
  }
  const configuredGeneratorIds = [...contract.generatorAppIds].sort((left, right) => left - right);
  const declaredGeneratorIds = [
    ...new Set(
      contract.deliveryPrerequisites
        .filter(item => item.classification === 'generator')
        .map(item => item.appId)
    ),
  ].sort((left, right) => left - right);
  if (
    new Set(configuredGeneratorIds).size !== configuredGeneratorIds.length ||
    JSON.stringify(configuredGeneratorIds) !== JSON.stringify(declaredGeneratorIds)
  ) {
    gateFail('generator app identity mismatch');
  }
  return contract;
}
export function eventPullNumber(eventName, event) {
  if (!['pull_request', 'pull_request_review', 'pull_request_review_comment'].includes(eventName))
    return null;
  return event.pull_request?.number ?? null;
}
export function selectCurrentCheck(spec, checks, headSha) {
  const named = checks.filter(item => item.context === spec.context);
  if (named.some(item => item.appId !== spec.appId))
    gateFail('wrong-app check for ' + spec.context);
  const matching = named.filter(item => item.appId === spec.appId);
  if (matching.some(item => item.headSha !== headSha))
    gateFail('stale-head check for ' + spec.context);
  if (!matching.length) {
    if (spec.requirement === 'optional') return null;
    throw new Error('WAIT: missing check ' + spec.context);
  }
  const runId = Math.max(...matching.map(item => item.runId));
  const run = matching.filter(item => item.runId === runId);
  const attempt = Math.max(...run.map(item => item.runAttempt));
  const current = run.filter(item => item.runAttempt === attempt);
  if (current.length !== 1) gateFail('duplicate current check ' + spec.context);
  if (current[0].status !== 'completed') throw new Error('WAIT: pending check ' + spec.context);
  const skipped = current[0].conclusion === 'skipped' && spec.skipWhen === 'non_product_only_pr';
  if (!spec.finalConclusions.includes(current[0].conclusion) && !skipped) {
    gateFail(spec.context + ' conclusion ' + (current[0].conclusion ?? 'missing'));
  }
  return current[0];
}
const normalizeFeedbackAuthor = (author = '') => author.replace(/\[bot\]$/u, '').toLowerCase();
function latestByAuthor(items) {
  const latest = new Map();
  for (const item of items) {
    const author = normalizeFeedbackAuthor(item.author);
    const time = item.submittedAt ?? item.createdAt ?? '';
    if (!latest.has(author) || latest.get(author).time < time) {
      latest.set(author, { ...item, time });
    }
  }
  return latest;
}
function generatorFeedback(contract, feedback) {
  const allowed = new Set(contract.feedbackAuthors);
  const bots = [...feedback.reviews, ...feedback.issueComments, ...feedback.reviewComments]
    .filter(item => !item.resolved)
    .filter(item => {
      const author = normalizeFeedbackAuthor(item.author);
      return allowed.has(author) || (item.author ?? '').endsWith('[bot]') || author === 'copilot';
    });
  for (const item of bots) {
    const author = normalizeFeedbackAuthor(item.author);
    if (!allowed.has(author)) gateFail('unknown generator feedback author ' + author);
  }
  return bots.filter(item => !item.commitId || item.commitId === feedback.headSha);
}
export function verifyFeedback(contract, feedback, headSha) {
  if (feedback.headSha !== headSha) gateFail('mixed-head feedback snapshot');
  if (Object.values(feedback.pagination).some(value => value !== true))
    gateFail('feedback pagination incomplete');
  if (feedback.unresolvedThreads.length) gateFail('unresolved review threads');
  if (feedback.pendingReviewers.length) throw new Error('WAIT: reviewers remain pending');
  const decisiveReviews = feedback.reviews.filter(review =>
    ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)
  );
  const latestReviews = latestByAuthor(decisiveReviews);
  if ([...latestReviews.values()].some(review => review.state === 'CHANGES_REQUESTED')) {
    gateFail('changes-requested review remains terminal');
  }
  for (const item of generatorFeedback(contract, feedback)) {
    if (ACTIONABLE_FEEDBACK_PATTERNS.some(pattern => pattern.test(item.body ?? ''))) {
      gateFail('actionable feedback remains from ' + normalizeFeedbackAuthor(item.author));
    }
  }
}
export function verifyCommitGraph(snapshot) {
  const { base, head, testedMerge } = snapshot.expected;
  if (![base, head, testedMerge].every(value => /^[a-f0-9]{40}$/u.test(value))) {
    gateFail('expected SHA mismatch');
  }
  if (
    snapshot.pull.state !== 'open' ||
    snapshot.pull.baseSha !== base ||
    snapshot.pull.headSha !== head
  )
    gateFail('pull request identity changed');
  const baseCommit = snapshot.commits[base];
  const headCommit = snapshot.commits[head];
  const tested = snapshot.commits[testedMerge];
  if (!baseCommit || !headCommit || !tested) gateFail('commit inventory incomplete');
  if (JSON.stringify(tested.parents) !== JSON.stringify([base, head])) {
    gateFail('tested merge parents mismatch');
  }
  if (headCommit.tree !== tested.tree) gateFail('head-only lane lacks tested tree equality');
  return tested.tree;
}
export function evaluateDeliveryChecks(contract, snapshot) {
  const selected = [];
  for (const spec of contract.deliveryPrerequisites) {
    const item = selectCurrentCheck(spec, snapshot.checks, snapshot.expected.head);
    if (!item) continue;
    if (item.conclusion === 'skipped' && snapshot.validationSurface.reason !== spec.skipWhen) {
      gateFail(spec.context + ' conclusion skipped without validation-surface proof');
    }
    if ((item.annotations ?? []).some(value => ['warning', 'failure'].includes(value.level))) {
      gateFail('actionable annotation on ' + spec.context);
    }
    selected.push({
      context: spec.context,
      appId: spec.appId,
      runId: item.runId,
      runAttempt: item.runAttempt,
      checkedSha: snapshot.expected.head,
      checkedTree: snapshot.commits[snapshot.expected.head].tree,
      conclusion: item.conclusion,
    });
  }
  return selected;
}
function ghJson(args) {
  const binary = GH_BINARY_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!binary) gateFail(`GitHub CLI not found in: ${GH_BINARY_CANDIDATES.join(', ')}`);
  return JSON.parse(execFileSync(binary, args, { encoding: 'utf8' }));
}
const checkLabel = check => check?.name ?? check?.context ?? check?.workflowName ?? 'unknown';
function checkState(check) {
  if (!check) return 'missing';
  return check.__typename === 'StatusContext'
    ? check.state
    : `${check.status}/${check.conclusion ?? 'pending'}`;
}
const findCheck = (checks, name) => checks.find(check => checkLabel(check) === name);
const strictFailures = checks =>
  REQUIRED_CHECKS.filter(name => !SUCCESS_STATES.has(checkState(findCheck(checks, name)))).map(
    name => `required check is not green: ${name}`
  );
function printSection(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) console.log(`- ${row}`);
}
function main() {
  const strict = process.argv.includes('--strict');
  const prArg = process.argv.slice(2).find(arg => arg !== '--' && arg !== '--strict');
  if (prArg && !/^\d+$/u.test(prArg)) {
    throw new Error('Usage: pnpm pr:governance:report -- [--strict] <PR_NUMBER>');
  }
  const pr = ghJson([
    'pr',
    'view',
    ...(prArg ? [prArg] : []),
    '--json',
    'number,statusCheckRollup',
  ]);
  const checks = pr.statusCheckRollup ?? [];
  console.log(`PR #${pr.number} governance report`);
  for (const [title, names] of [
    ['Required checks', REQUIRED_CHECKS],
    ['Monitored checks', MONITORED_CHECKS],
  ])
    printSection(
      title,
      names.map(name => `${name}: ${checkState(findCheck(checks, name))}`)
    );
  printSection('Feedback terminality', ['enforced by delivery-gate final intake']);
  if (strict) {
    const failures = strictFailures(checks);
    printSection(
      'Strict review readiness',
      failures.length === 0 ? ['PASS'] : failures.map(failure => `FAIL: ${failure}`)
    );
    if (failures.length > 0) process.exitCode = 1;
  }
}

if (isDirectInvocation(import.meta.url)) main();
