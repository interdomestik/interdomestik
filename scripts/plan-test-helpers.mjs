import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function createTempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

export function runScript(scriptPath, root, args = []) {
  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);

  return spawnSync(process.execPath, [absoluteScriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

export function authoritativeDoc(role, filePath, extra = '') {
  return `---
plan_role: ${role}
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-05
---

# ${filePath}

Authoritative content.
${extra}`;
}

export function programDoc(phase = 'Canonical execution.', goals = ['One plan.', 'One tracker.']) {
  const goalList = goals.map((goal, index) => `${index + 1}. ${goal}`).join('\n');

  return `# Current Program

## Current Phase

${phase}

## Program Goals

${goalList}
`;
}

export function queueRow(overrides = {}) {
  return {
    id: 'PG1',
    status: 'completed',
    owner: 'platform',
    work: 'Ship the policy.',
    exitCriteria: 'Audit passes.',
    ...overrides,
  };
}

export function proofRow(overrides = {}) {
  return {
    id: 'PG1',
    sourceRefs: '`governance:policy`',
    execution: 'manual',
    runId: 'manual-20260305-governance',
    runRoot: 'not_applicable',
    sonar: 'not_applicable',
    docker: 'not_applicable',
    sentry: 'not_applicable',
    learning: 'not_applicable',
    evidenceRefs: '`docs/plans/current-program.md`',
    ...overrides,
  };
}

export function trackerDoc(queueRows, proofRows, options = {}) {
  const frontMatter = options.withFrontMatter
    ? `---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-05
---

`
    : '';
  const queueBody = queueRows
    .map(
      row =>
        `| \`${row.id}\` | \`${row.status}\` | \`${row.owner}\` | ${row.work} | ${row.exitCriteria} |`
    )
    .join('\n');
  const proofBody = proofRows
    .map(
      row =>
        `| \`${row.id}\` | ${row.sourceRefs} | \`${row.execution}\` | \`${row.runId}\` | \`${row.runRoot}\` | \`${row.sonar}\` | \`${row.docker}\` | \`${row.sentry}\` | \`${row.learning}\` | ${row.evidenceRefs} |`
    )
    .join('\n');

  return `${frontMatter}# Current Tracker

## Active Queue

| ID | Status | Owner | Work | Exit Criteria |
| --- | --- | --- | --- | --- |
${queueBody}

## Proof Ledger

| ID | Source Refs | Execution | Run ID | Run Root | Sonar | Docker | Sentry | Learning | Evidence Refs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${proofBody}
`;
}

export function inputDoc(
  status,
  extraFrontMatter = '',
  body = '> Status: Input only.\n\n# Input\n\nContext only.\n'
) {
  return `---
plan_role: input
status: ${status}
source_of_truth: false
owner: platform
last_reviewed: 2026-03-05
${extraFrontMatter}---

${body}`;
}

export function writeGovernedDocs(
  root,
  {
    program = authoritativeDoc('canonical_plan', 'current-program'),
    tracker = trackerDoc([queueRow()], [proofRow()], { withFrontMatter: true }),
    executionLog = authoritativeDoc('execution_log', 'current-log'),
  } = {}
) {
  writeFile(root, 'docs/plans/current-program.md', program);
  writeFile(root, 'docs/plans/current-tracker.md', tracker);
  writeFile(root, 'docs/plans/current-log.md', executionLog);
}
