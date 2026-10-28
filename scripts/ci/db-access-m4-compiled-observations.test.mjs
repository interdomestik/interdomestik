import test from 'node:test';
import assert from 'node:assert/strict';
import { validateM4CompiledObservations } from './db-access-m4-compiled-observations.mjs';
import { comparisonFixture } from './db-access-m4-compiled-observations.fixture.mjs';
import {
  isFreshM4CompiledRuntimeResult,
  hasM4CompiledRuntimeBinding,
  assertM4CompiledRuntimeImageRecords,
} from './db-access-m4-compiled-producer-loader.mjs';

test('pure tuple comparison preserves all 3 positive contexts and 1 current denial without minting', () => {
  const result = validateM4CompiledObservations(comparisonFixture());
  assert.equal(result.length, 4);
  assert(Object.isFrozen(result) && result.every(Object.isFrozen));
  assert.equal(isFreshM4CompiledRuntimeResult(result), false);
  assert.equal(isFreshM4CompiledRuntimeResult({ completion: result, checksPassed: true }), false);
});
for (const [name, mutate] of [
  ['incomplete browser report', f => (f.browser.complete = false)],
  [
    'denial result found by global UUID query',
    f => f.denialSql.ledger.push({ operation_id: f.browser.denial.operationId }),
  ],
  ['denial audit UUID present', f => f.denialSql.audit.push({ id: 'unexpected' })],
  ['no actual denial SQL query', f => delete f.denialSql],
  ['missing positive', f => f.browser.rows.pop()],
  ['duplicate claim', f => (f.cases[1].claimId = f.cases[0].claimId)],
  ['profile reordering', f => f.cases.reverse()],
  ['wrong compiler action ID', f => (f.browser.rows[0].frameworkActionId = 'b')],
  ['operation alias', f => (f.browser.rows[1].operationId = f.browser.rows[0].operationId)],
  ['wrong actor ledger', f => (f.sql[0].result[0].actor_id = 'foreign')],
  ['wrong tenant claim', f => (f.sql[0].claim[0].tenant_id = 'foreign')],
  ['missing mandatory audit', f => (f.sql[0].audit = [])],
  ['extra audit multiplicity', f => f.sql[0].audit.push(f.sql[0].audit[0])],
  ['wrong audit actor', f => (f.sql[0].audit[0].actor_id = 'foreign')],
  [
    'authoritative caller metadata',
    f => (f.sql[0].audit[0].metadata.requestObservation.authoritative = true),
  ],
  ['wrong audit target', f => (f.sql[0].audit[0].metadata.newStaffId = 'foreign')],
  ['ineligible current target', f => (f.sql[0].target[0].role = 'member')],
  ['foreign current target', f => (f.sql[0].target[0].tenant_id = 'foreign')],
  ['unexpected external email eligibility', f => (f.sql[0].target[0].emailVerified = true)],
  ['missing ledger', f => (f.sql[1].result = [])],
  [
    'wrong entry fingerprint',
    f => (f.sql[1].result[0].request_fingerprint = f.sql[0].result[0].request_fingerprint),
  ],
  ['fake changed noop', f => (f.sql[0].result[0].response.changed = false)],
  ['missing notification', f => (f.sql[0].notifications = [])],
  ['extra staff notification', f => (f.sql[2].notifications = f.sql[0].notifications)],
  ['wrong notification target', f => (f.sql[0].notifications[0].user_id = 'foreign')],
  ['wrong request digest', f => (f.owner.transport.rows[0].requestDigest = '0'.repeat(64))],
  ['wrong response digest', f => (f.owner.contexts.rows[0].responseDigest = '0'.repeat(64))],
  [
    'local constructor relabel',
    f => (f.owner.contexts.constructorName = 'createM4LocalQualificationAssignmentRuntime'),
  ],
  ['loopback bypass', f => (f.owner.loopbackQualification = true)],
  ['dropped duplicate transport', f => f.owner.transport.rows.push(f.owner.transport.rows[0])],
  ['runtime ordinal mismatch', f => (f.owner.contexts.rows[1].ordinal = 1)],
  ['delivery not finished', f => (f.owner.transport.rows[0].delivery = 'closed')],
  [
    'cache did not invalidate',
    f => (f.browser.rows[0].refreshedCacheToken = f.browser.rows[0].firstCacheToken),
  ],
  ['cold cache claimed', f => (f.browser.rows[0].warmHit = false)],
  ['missing denial tuple', f => delete f.browser.denial],
  ['denial invalidates cache', f => (f.browser.denial.refreshedCacheToken = 'changed')],
  ['denial becomes indeterminate', f => (f.owner.transport.rows[3].outcome = 'indeterminate')],
  [
    'denial aliases successful operation',
    f => (f.browser.denial.operationId = f.browser.rows[0].operationId),
  ],
])
  test('refuses semantic comparison mutant: ' + name, () => {
    const fixture = comparisonFixture();
    mutate(fixture);
    assert.throws(() => validateM4CompiledObservations(fixture));
  });
test('serialized metadata, prototype and Boolean objects cannot manufacture private evidence', () => {
  for (const value of [
    null,
    {},
    Object.freeze({ executed: true, complete: true }),
    JSON.parse(JSON.stringify(comparisonFixture())),
    Object.create({ kind: 'fresh-strict-compiled-runtime' }),
  ]) {
    assert.equal(isFreshM4CompiledRuntimeResult(value), false);
    assert.equal(hasM4CompiledRuntimeBinding(value, {}, 'a'.repeat(64)), false);
    assert.throws(
      () => assertM4CompiledRuntimeImageRecords(value, {}, 'a'.repeat(64)),
      /protected producer admission/
    );
  }
});
