import { mountedCompletionFixture } from './db-access-m4-runtime-mounted-result.fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { M4_RUNTIME_CONTRACT as contract } from './db-access-m4-runtime-contract.mjs';
import { validateM4RuntimeCompletion } from './db-access-m4-runtime-result.mjs';
import { isFreshM4RuntimeResult, hasM4RuntimeBinding } from './db-access-m4-runtime.mjs';
import { m4FixtureFailureSite } from './db-access-m4-runtime-fixture.mjs';

test('failure location excludes assertion values, credentials, unknown files and full paths', () => {
  const file = 'db-access-m4-runtime-fixture-ops-oracles.mjs';
  const site = m4FixtureFailureSite({
    stack: `AssertionError: PRIVATE_DATABASE_URL and expected secret\n    at async file:///private/secret-root/${file}:133:16`,
  });
  assert.deepEqual(site, { file, line: 133, column: 16 });
  assert.equal(JSON.stringify(site).includes('secret'), false);
  assert.equal(
    m4FixtureFailureSite({ stack: 'Error: /db-access-m4-runtime-fixture-secret.mjs:1:2' }),
    undefined
  );
  assert.equal(m4FixtureFailureSite({ stack: 'PRIVATE_DATABASE_URL' }), undefined);
});
const good = () => mountedCompletionFixture(contract);
test('complete report shape is never a fresh executed result', () => {
  const report = good(),
    validated = validateM4RuntimeCompletion(report);
  assert.equal(validated.total, 39);
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
