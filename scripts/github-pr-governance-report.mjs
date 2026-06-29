#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const REQUIRED_CHECKS = [
  'audit',
  'e2e',
  'pnpm-audit',
  'gitleaks',
  'pilot-gate',
  'validation-surface',
  'pr-finalizer',
  'commitlint',
  'CodeQL',
  'Analyze (actions)',
  'Analyze (javascript-typescript)',
];
const MONITORED_CHECKS = ['static', 'unit', 'e2e-gate', 'SonarCloud Code Analysis'];

const CODEX_AUTHORS = new Set(['chatgpt-codex-connector', 'openai-codex']);
const COPILOT_AUTHORS = new Set(['copilot-pull-request-reviewer']);
const GH_BINARY_CANDIDATES = ['/usr/bin/gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh'];
const SUCCESS_STATES = new Set(['SUCCESS', 'COMPLETED/SUCCESS']);
const CURRENT_HEAD_PREFIX_LENGTHS = [7, 8, 10];
function resolveGhBinary() {
  const binary = GH_BINARY_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!binary) {
    throw new Error(`GitHub CLI not found in: ${GH_BINARY_CANDIDATES.join(', ')}`);
  }
  return binary;
}
function prNumberArg() {
  const prArg = process.argv.slice(2).find(arg => arg !== '--' && arg !== '--strict');
  if (prArg && !/^\d+$/u.test(prArg)) {
    throw new Error('Usage: pnpm pr:governance:report -- [--strict] <PR_NUMBER>');
  }
  return prArg;
}
const isStrictMode = () => process.argv.includes('--strict');
function readPr() {
  const prArg = prNumberArg();
  const args = ['pr', 'view'];
  if (prArg) {
    args.push(prArg);
  }
  args.push('--json', 'number,headRefOid,statusCheckRollup,reviews,comments');
  const output = execFileSync(resolveGhBinary(), args, { encoding: 'utf8' });
  return JSON.parse(output);
}
const actorLogin = item => item?.author?.login ?? '';
const checkLabel = check => check?.name ?? check?.context ?? check?.workflowName ?? 'unknown';
const itemCommitOid = item => {
  if (typeof item?.commit === 'string') return item.commit;
  return item?.commit?.oid ?? '';
};
function checkState(check) {
  if (!check) return 'missing';
  return check.__typename === 'StatusContext'
    ? check.state
    : `${check.status}/${check.conclusion ?? 'pending'}`;
}
const findCheck = (checks, name) => checks.find(check => checkLabel(check) === name);
const hasAuthor = (items, authors) => items.some(item => authors.has(actorLogin(item)));
const authorItems = (items, authors) => items.filter(item => authors.has(actorLogin(item)));
function itemBody(item) {
  return typeof item?.body === 'string' ? item.body : '';
}
function currentHeadPrefixes(head) {
  return [head, ...CURRENT_HEAD_PREFIX_LENGTHS.map(length => head.slice(0, length))].filter(Boolean);
}
function itemReferencesCurrentHead(item, head) {
  const commitOid = itemCommitOid(item);
  if (commitOid) {
    return commitOid === head || currentHeadPrefixes(head).includes(commitOid);
  }
  const body = itemBody(item);
  return currentHeadPrefixes(head).some(prefix => body.includes(prefix));
}
function hasCurrentHeadSignal(pr, items, authors) {
  const head = pr.headRefOid ?? '';
  if (!head) return false;
  return authorItems(items, authors).some(item => itemReferencesCurrentHead(item, head));
}
const envFlag = name => /^(1|true|yes|on)$/iu.test(process.env[name] ?? '');
function strictFailures(pr, checks, reviews, comments) {
  const failures = [];
  for (const checkName of REQUIRED_CHECKS) {
    if (!SUCCESS_STATES.has(checkState(findCheck(checks, checkName)))) {
      failures.push(`required check is not green: ${checkName}`);
    }
  }
  if (
    !hasCurrentHeadSignal(pr, reviews, COPILOT_AUTHORS) &&
    !envFlag('PR_REVIEW_READY_ALLOW_MISSING_COPILOT')
  ) {
    failures.push(
      'Copilot current-head review is absent; request Copilot review or set an explicit waiver env'
    );
  }
  if (
    !hasCurrentHeadSignal(pr, [...reviews, ...comments], CODEX_AUTHORS) &&
    !envFlag('PR_REVIEW_READY_ALLOW_MISSING_CODEX')
  ) {
    failures.push('Codex current-head review is absent; request @codex review or set a waiver env');
  }
  return failures;
}
function printSection(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(`- ${row}`);
  }
}
const strict = isStrictMode();
const pr = readPr();
const checks = pr.statusCheckRollup ?? [];
const reviews = pr.reviews ?? [];
const comments = pr.comments ?? [];
console.log(`PR #${pr.number} governance report`);
printSection(
  'Required checks',
  REQUIRED_CHECKS.map(name => `${name}: ${checkState(findCheck(checks, name))}`)
);
printSection(
  'Monitored checks',
  MONITORED_CHECKS.map(name => `${name}: ${checkState(findCheck(checks, name))}`)
);
printSection('External feedback', [
  `Sonar: ${checkState(findCheck(checks, 'SonarCloud Code Analysis'))}`,
  `CodeQL: ${checkState(findCheck(checks, 'CodeQL'))}; ${checkState(
    findCheck(checks, 'Analyze (actions)')
  )}; ${checkState(findCheck(checks, 'Analyze (javascript-typescript)'))}`,
  `Copilot any review: ${hasAuthor(reviews, COPILOT_AUTHORS) ? 'present' : 'absent'}`,
  `Copilot current-head review: ${hasCurrentHeadSignal(pr, reviews, COPILOT_AUTHORS) ? 'present' : 'absent'}`,
  `Codex review/comment: ${
    hasAuthor(reviews, CODEX_AUTHORS) || hasAuthor(comments, CODEX_AUTHORS) ? 'present' : 'absent'
  }`,
  `Codex current-head review: ${hasCurrentHeadSignal(pr, [...reviews, ...comments], CODEX_AUTHORS) ? 'present' : 'absent'}`,
]);
if (strict) {
  const failures = strictFailures(pr, checks, reviews, comments);
  printSection(
    'Strict review readiness',
    failures.length === 0 ? ['PASS'] : failures.map(failure => `FAIL: ${failure}`)
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}
