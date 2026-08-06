import assert from 'node:assert/strict';
import test from 'node:test';
import './z620-parity-policy-command-contracts.mjs';
import './z620-parity-policy-digests.mjs';
import './z620-parity-policy-validation.mjs';
import {
  validateCommandCoverage,
  validateGateCoverage,
  validateSourceDigests,
  validateWorkflowDigests,
} from './z620-parity-lib.mjs';
import { gates, parity, root } from './z620-parity-policy-fixtures.mjs';

test('workflow content matches the reviewed parity digests', () => {
  assert.deepEqual(validateWorkflowDigests(root, parity), []);
});

test('every non-provider blocking job has known local lane coverage', () => {
  assert.deepEqual(validateGateCoverage(parity, gates), []);
  assert.equal(gates.lanes.database.resourceOwned, true);
  assert.equal(gates.lanes.build.resourceOwned, true);
});

test('every substitutable command maps back to exact CI evidence', () => {
  assert.deepEqual(validateCommandCoverage(parity, gates), []);
  assert.deepEqual(validateSourceDigests(root, parity), []);
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
