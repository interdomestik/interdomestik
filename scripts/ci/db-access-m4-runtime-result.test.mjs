import assert from 'node:assert/strict';
import test from 'node:test';
import { M4_RUNTIME_CONTRACT as contract } from './db-access-m4-runtime-contract.mjs';
import { validateM4RuntimeCompletion } from './db-access-m4-runtime-result.mjs';
import { isFreshM4RuntimeResult, hasM4RuntimeBinding } from './db-access-m4-runtime.mjs';
const good = () => ({
  version: 1,
  complete: true,
  setupComplete: true,
  cleanupComplete: true,
  remainingOwnedSessions: 0,
  runtimeAdmission: false,
  nativeAdmission: false,
  privateCases: contract.caseIDs.private.map(id => ({ id, passed: true })),
  profileCases: contract.caseIDs.profiles.map(id => ({ id, passed: true })),
  minimalOpsPrivilegeDiagnostic: {
    expectedMinimalGrants: true,
    positiveRows: 1,
    forbiddenBranchSelectSqlstate: '42501',
    roleGrantExpansion: false,
  },
});
test('complete report shape is never a fresh executed result', () => {
  const report = good(),
    validated = validateM4RuntimeCompletion(report);
  assert.equal(validated.total, 31);
  assert.equal(isFreshM4RuntimeResult(report), false);
  assert.equal(isFreshM4RuntimeResult(validated), false);
  assert.equal(isFreshM4RuntimeResult(JSON.parse(JSON.stringify(report))), false);
  assert.equal(hasM4RuntimeBinding(report, { version: 1 }, 'forged'), false);
});
for (const [name, change] of [
  ['missing exact case', r => r.privateCases.pop()],
  ['duplicated case', r => (r.profileCases[1] = r.profileCases[0])],
  ['wrong ordered case', r => r.privateCases.reverse()],
  ['failed assertion', r => (r.profileCases[0].passed = false)],
  ['skip', r => (r.privateCases[0].skipped = true)],
  ['cancellation', r => (r.privateCases[0].cancelled = true)],
  ['todo', r => (r.privateCases[0].todo = true)],
  ['unfinished setup', r => (r.setupComplete = false)],
  ['unfinished cleanup', r => (r.cleanupComplete = false)],
  ['remaining backend', r => (r.remainingOwnedSessions = 1)],
  ['privilege expanded', r => (r.minimalOpsPrivilegeDiagnostic.roleGrantExpansion = true)],
  ['no positive readable row', r => (r.minimalOpsPrivilegeDiagnostic.positiveRows = 0)],
  [
    'wrong privilege refusal',
    r => (r.minimalOpsPrivilegeDiagnostic.forbiddenBranchSelectSqlstate = '08006'),
  ],
  ['runtime admission claim', r => (r.runtimeAdmission = true)],
  ['native admission claim', r => (r.nativeAdmission = true)],
])
  test(name + ' refuses completion without minting provenance', () => {
    const report = good();
    change(report);
    assert.throws(() => validateM4RuntimeCompletion(report), /M4 runtime result refused/);
    assert.equal(isFreshM4RuntimeResult(report), false);
  });
