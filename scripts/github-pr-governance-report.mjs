#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const REQUIRED_CHECKS = [
  'audit',
  'static',
  'unit',
  'e2e-gate',
  'e2e',
  'pnpm-audit',
  'gitleaks',
  'pilot-gate',
  'validation-surface',
  'pr-finalizer',
  'commitlint',
  'SonarCloud Code Analysis',
  'CodeQL',
  'Analyze (actions)',
  'Analyze (javascript-typescript)',
];

const CODEX_AUTHORS = new Set(['chatgpt-codex-connector', 'openai-codex']);
const COPILOT_AUTHORS = new Set(['copilot-pull-request-reviewer']);

function readPr() {
  const prArg = process.argv.slice(2).filter(arg => arg !== '--')[0];
  const args = ['pr', 'view'];
  if (prArg) {
    args.push(prArg);
  }
  args.push('--json', 'number,statusCheckRollup,reviews,comments');
  const output = execFileSync('gh', args, { encoding: 'utf8' });
  return JSON.parse(output);
}

function actorLogin(item) {
  return item?.author?.login ?? '';
}

function checkLabel(check) {
  return check?.name ?? check?.context ?? check?.workflowName ?? 'unknown';
}

function checkState(check) {
  if (!check) {
    return 'missing';
  }
  return check.__typename === 'StatusContext'
    ? check.state
    : `${check.status}/${check.conclusion ?? 'pending'}`;
}

function findCheck(checks, name) {
  return checks.find(check => checkLabel(check) === name);
}

function hasAuthor(items, authors) {
  return items.some(item => authors.has(actorLogin(item)));
}

function printSection(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(`- ${row}`);
  }
}

const pr = readPr();
const checks = pr.statusCheckRollup ?? [];
const reviews = pr.reviews ?? [];
const comments = pr.comments ?? [];

console.log(`PR #${pr.number} governance report`);
printSection(
  'Required and monitored checks',
  REQUIRED_CHECKS.map(name => `${name}: ${checkState(findCheck(checks, name))}`)
);

printSection('External feedback', [
  `Sonar: ${checkState(findCheck(checks, 'SonarCloud Code Analysis'))}`,
  `CodeQL: ${checkState(findCheck(checks, 'CodeQL'))}; ${checkState(
    findCheck(checks, 'Analyze (actions)')
  )}; ${checkState(findCheck(checks, 'Analyze (javascript-typescript)'))}`,
  `Copilot review: ${hasAuthor(reviews, COPILOT_AUTHORS) ? 'present' : 'absent'}`,
  `Codex review/comment: ${
    hasAuthor(reviews, CODEX_AUTHORS) || hasAuthor(comments, CODEX_AUTHORS) ? 'present' : 'absent'
  }`,
]);
