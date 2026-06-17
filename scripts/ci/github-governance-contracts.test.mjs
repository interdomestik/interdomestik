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
  'static',
  'unit',
  'e2e-gate',
  'e2e',
  'pnpm-audit',
  'gitleaks',
  'pilot-gate',
  'pr-finalizer',
  'commitlint',
  'SonarCloud Code Analysis',
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

  assert.doesNotMatch(protectionDoc, /multi-agent-dry-run/);
  assert.match(protectionDoc, /Copilot review is expected but not deterministic/);
  assert.match(protectionDoc, /Codex GitHub review is\s+expected when enabled/);
});

test('governance report script is wired and names external reviewer signals', () => {
  const packageJson = JSON.parse(read('package.json'));
  const reportScript = read('scripts/github-pr-governance-report.mjs');

  assert.equal(
    packageJson.scripts['pr:governance:report'],
    'node scripts/github-pr-governance-report.mjs'
  );
  assert.match(reportScript, /SonarCloud Code Analysis/);
  assert.match(reportScript, /CodeQL/);
  assert.match(reportScript, /copilot-pull-request-reviewer/);
  assert.match(reportScript, /chatgpt-codex-connector/);
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

test('PR finalizer local polling covers current deterministic required checks', () => {
  const finalizer = read('scripts/pr-finalizer.sh');

  for (const checkName of REQUIRED_CHECKS.filter(name => name !== 'pr-finalizer')) {
    assert.match(finalizer, new RegExp(`"${escapeRegexLiteral(checkName)}"`));
  }
  assert.match(finalizer, /\(\.name \/\/ \.workflow_name \/\/ ""\) == \$NAME/);
});
