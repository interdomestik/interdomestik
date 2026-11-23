import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveGateCommand } from './z620-gate-command-lib.mjs';
import { validateGateCoverage, validateWorkflowDigests } from './z620-parity-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const parity = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-parity.json')));
const gates = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-gates.json')));

test('workflow content matches the reviewed parity digests', () => {
  assert.deepEqual(validateWorkflowDigests(root, parity), []);
});

test('every non-provider blocking job has known local lane coverage', () => {
  assert.deepEqual(validateGateCoverage(parity, gates), []);
  assert.equal(gates.lanes.database.resourceOwned, true);
  assert.equal(gates.lanes.build.resourceOwned, true);
});

test('Z620 covers the split PR gate projects and smoke under the same workflow job ID', () => {
  assert.deepEqual(gates.jobCoverage['.github/workflows/e2e-pr.yml#e2e-runner'], [
    'database',
    'e2e-pr',
  ]);
  assert.deepEqual(gates.jobCoverage['.github/workflows/e2e-pr.yml#e2e'], ['e2e-pr']);
  assert.deepEqual(gates.lanes['e2e-pr'].commands, ['e2e-gate-pr', 'e2e-smoke-pr']);
  assert.deepEqual(resolveGateCommand('e2e-smoke-pr').args, [
    'scripts/run-e2e-lane.mjs',
    'pr-smoke',
  ]);
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

test('unknown and missing lane mappings fail closed', () => {
  const fixture = structuredClone(gates);
  delete fixture.jobCoverage['.github/workflows/ci.yml#static'];
  fixture.jobCoverage['.github/workflows/ci.yml#ghost'] = ['missing-lane'];
  const problems = validateGateCoverage(parity, fixture).join('\n');
  assert.match(problems, /static: missing local gate coverage/);
  assert.match(problems, /ghost: unknown or excluded job coverage/);
  assert.match(problems, /unknown lane missing-lane/);
});
