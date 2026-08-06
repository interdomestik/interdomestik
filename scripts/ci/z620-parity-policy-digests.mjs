import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateSourceDigests, validateWorkflowDigests } from './z620-parity-lib.mjs';
import { parity, root } from './z620-parity-policy-fixtures.mjs';
import { paritySourcePaths } from './z620-parity-sources.mjs';

const expectedSourcePaths = [
  'apps/web/package.json',
  'apps/web/playwright.config.ts',
  'package.json',
  'scripts/ci-local-parity.sh',
  'scripts/ci/z620-gate-command-lib.mjs',
  'scripts/ci/z620-gates-command-coverage.json',
  'scripts/ci/z620-gates-command-policy.json',
  'scripts/ci/z620-gates-job-commands.json',
  'scripts/ci/z620-gates-lanes.json',
  'scripts/ci/z620-gates-loader.mjs',
  'scripts/ci/z620-gates.json',
  'scripts/run-e2e-lane.mjs',
];

test('web smoke package manifest is bound into the exact source inventory', () => {
  assert.deepEqual(paritySourcePaths, expectedSourcePaths);
  assert.deepEqual(
    Object.keys(parity.sourceDigests).sort((left, right) => left.localeCompare(right)),
    expectedSourcePaths
  );

  const changed = structuredClone(parity);
  changed.sourceDigests['apps/web/package.json'] = '0'.repeat(64);
  assert.deepEqual(validateSourceDigests(root, changed), [
    'apps/web/package.json: source changed without parity digest update',
  ]);
});

test('reviewed command sources fail closed on inventory or content drift', () => {
  const missing = structuredClone(parity);
  delete missing.sourceDigests['package.json'];
  assert.match(validateSourceDigests(root, missing).join('\n'), /source digest inventory/iu);

  const changed = structuredClone(parity);
  changed.sourceDigests['package.json'] = '0'.repeat(64);
  assert.match(
    validateSourceDigests(root, changed).join('\n'),
    /source changed without parity digest/u
  );
});

test('workflow changes fail closed until parity is reviewed', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-policy-'));
  for (const workflowPath of Object.keys(parity.workflows)) {
    const destination = path.join(fixtureRoot, workflowPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, workflowPath), destination);
  }
  fs.appendFileSync(path.join(fixtureRoot, '.github/workflows/ci.yml'), '\n# fixture change\n');
  assert.match(validateWorkflowDigests(fixtureRoot, parity).join('\n'), /without parity digest/);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});
