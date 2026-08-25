import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createTempRoot,
  programDoc,
  proofRow,
  queueRow,
  runScript,
  trackerDoc,
  writeFile,
} from './plan-test-helpers.mjs';

const leanProjection = {
  schemaVersion: 1,
  authority: 'lean-tier12-v1',
  lifecycle: 'inactive',
  owner: { login: 'arbenl', id: 62884977 },
  activeSlice: null,
};
const leanBlock = `\n\n## Lean Authority\n\n\`\`\`json lean-authority\n${JSON.stringify(leanProjection, null, 2)}\n\`\`\`\n`;

test('plan-status delegates runtime state to the live repository resolver', () => {
  const source = readFileSync(new URL('./plan-status.mjs', import.meta.url), 'utf8');
  assert.match(source, /resolveRepositoryAuthority\(process\.cwd\(\), !documentOnly\)/u);
});

test('plan-status prints the current phase and queue from canonical files', () => {
  const root = createTempRoot('plan-status-');

  writeFile(root, 'docs/plans/current-program.md', `${programDoc()}${leanBlock}`);
  writeFile(
    root,
    'docs/plans/current-tracker.md',
    `${trackerDoc([queueRow()], [proofRow()])}${leanBlock}`
  );

  const result = runScript('scripts/plan-status.mjs', root, ['--document-only']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Current phase: Canonical execution\./);
  assert.match(
    result.stdout,
    /Lean authority: inactive; runtimeAuthorized=false; activeSlice=null/
  );
  assert.match(result.stdout, /PG1 \[completed\] Ship the policy\./);
  assert.match(
    result.stdout,
    /PG1 proof: source=governance:policy exec=manual run=manual-20260305-governance/
  );
});

test('plan-status fails when canonical files are missing', () => {
  const root = createTempRoot('plan-status-missing-');
  const result = runScript('scripts/plan-status.mjs', root, ['--document-only']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /plan:status failed: missing/);
});

test('plan-status prints missing proof state when queue exists without proof rows', () => {
  const root = createTempRoot('plan-status-missing-proof-');

  writeFile(root, 'docs/plans/current-program.md', `${programDoc()}${leanBlock}`);
  writeFile(root, 'docs/plans/current-tracker.md', `${trackerDoc([queueRow()], [])}${leanBlock}`);

  const result = runScript('scripts/plan-status.mjs', root, ['--document-only']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Proof snapshot:/);
  assert.match(result.stdout, /PG1 proof: missing/);
});

test('live plan-status rejects a noncanonical repository identity', () => {
  const root = createTempRoot('plan-status-untrusted-');
  writeFile(root, 'docs/plans/current-program.md', `${programDoc()}${leanBlock}`);
  writeFile(root, 'docs/plans/current-tracker.md', `${trackerDoc([], [])}${leanBlock}`);
  const result = runScript('scripts/plan-status.mjs', root);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Lean authority: blocked/);
});

test('live plan-status reports malformed Lean evidence as a stable blocked state', () => {
  const root = createTempRoot('plan-status-malformed-lean-');
  const malformed = '\n\n## Lean Authority\n\n```json lean-authority\n{"bad":true}\n```\n';
  writeFile(root, 'docs/plans/current-program.md', `${programDoc()}${malformed}`);
  writeFile(root, 'docs/plans/current-tracker.md', `${trackerDoc([], [])}${malformed}`);
  const result = runScript('scripts/plan-status.mjs', root);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Lean authority: blocked/);
  assert.doesNotMatch(result.stderr, /lean authority failed|SyntaxError|Error:/u);
});
