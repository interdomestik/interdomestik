import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  'CodeQL',
  'Analyze (actions)',
  'Analyze (javascript-typescript)',
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

  assert.match(prTemplate, /@codex review/);
  assert.match(prTemplate, /current-head Copilot review/);
  assert.match(prTemplate, /pnpm pr:review-ready -- <PR_NUMBER>/);
  assert.doesNotMatch(protectionDoc, /multi-agent-dry-run/);
  assert.match(protectionDoc, /Copilot review is expected but not deterministic/);
  assert.match(protectionDoc, /Codex GitHub review is\s+expected when enabled/);
  assert.match(protectionDoc, /Do not require `static`, `unit`, or `e2e-gate` globally/);
  assert.match(protectionDoc, /Do not require\s+`SonarCloud Code Analysis` globally/);
});

test('governance report script is wired and names external reviewer signals', () => {
  const packageJson = JSON.parse(read('package.json'));
  const reportScript = read('scripts/github-pr-governance-report.mjs');

  assert.equal(
    packageJson.scripts['pr:governance:report'],
    'node scripts/github-pr-governance-report.mjs'
  );
  assert.equal(packageJson.scripts['pr:review-ready'], 'bash scripts/pr-review-ready.sh');
  assert.match(reportScript, /SonarCloud Code Analysis/);
  assert.match(reportScript, /CodeQL/);
  assert.match(reportScript, /copilot-pull-request-reviewer/);
  assert.match(reportScript, /chatgpt-codex-connector/);
  assert.match(reportScript, /normalizeActorLogin/);
  assert.match(reportScript, /\\\[bot\\\]/);
  assert.match(reportScript, /itemCommitOid/);
  assert.match(reportScript, /repos\/\$\{repo\}\/pulls\/\$\{prNumber\}\/reviews/);
  assert.match(reportScript, /commit_id/);
  assert.match(reportScript, /MONITORED_CHECKS/);
  assert.match(reportScript, /CURRENT_HEAD_PREFIX_LENGTHS = \[7, 8, 10\]/);
  assert.match(reportScript, /hasCurrentHeadSignal/);
  assert.match(reportScript, /strictFailures\(pr, checks, reviews, comments\)/);
  assert.match(reportScript, /Copilot current-head review/);
  assert.match(reportScript, /Codex current-head review/);
  assert.match(reportScript, /PR_REVIEW_READY_ALLOW_MISSING_COPILOT/);
  assert.match(reportScript, /PR_REVIEW_READY_ALLOW_MISSING_CODEX/);
  assert.match(reportScript, /\^\\d\+\$/);

  const requiredChecksBlock = reportScript.match(/const REQUIRED_CHECKS = \[[\s\S]*?\];/)?.[0];
  const monitoredChecksBlock = reportScript.match(/const MONITORED_CHECKS = \[[\s\S]*?\];/)?.[0];
  assert.ok(requiredChecksBlock);
  assert.ok(monitoredChecksBlock);
  for (const monitoredCheck of ['static', 'unit', 'e2e-gate', 'SonarCloud Code Analysis']) {
    assert.doesNotMatch(requiredChecksBlock, new RegExp(`'${escapeRegexLiteral(monitoredCheck)}'`));
    assert.match(monitoredChecksBlock, new RegExp(`'${escapeRegexLiteral(monitoredCheck)}'`));
  }
});

test('review-ready script composes finalizer and strict governance report', () => {
  const script = read('scripts/pr-review-ready.sh');

  assert.match(script, /PR_FINALIZER_SKIP_CHECK_POLLING/);
  assert.match(script, /\[\[ "\$\{1:-\}" == "--" \]\]/);
  assert.match(script, /shift/);
  assert.match(script, /GITHUB_EVENT_PATH="" bash scripts\/pr-finalizer\.sh/);
  assert.match(script, /boundary-diff-report\.mjs/);
  assert.match(script, /gh api --paginate "repos\/\$\{repo\}\/pulls\/\$\{pr_number\}\/files\?per_page=100"/);
  assert.match(script, /\.\[\]\.filename/);
  assert.match(script, /Phase C no-touch files changed/);
  assert.match(script, /return 1/);
  assert.match(script, /node scripts\/github-pr-governance-report\.mjs --strict/);
  assert.match(script, /PR_REVIEW_READY_ALLOW_MISSING_COPILOT/);
  assert.match(script, /PR_REVIEW_READY_ALLOW_MISSING_CODEX/);
  assert.match(script, /phase-c-no-touch-authorized/);
  assert.match(script, /PR_REVIEW_READY_ALLOW_NO_TOUCH/);
  assert.match(script, /PR_REVIEW_READY_NO_TOUCH_REASON/);
  assert.match(script, /resolve_pr_number/);
  assert.match(script, /GITHUB_EVENT_PATH/);
  assert.match(script, /gh pr view --json number/);
  assert.match(script, /has_no_touch_authorization/);
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
