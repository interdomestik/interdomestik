import assert from 'node:assert/strict';
import test from 'node:test';
import { compareOperationBoundaryLineage } from './db-access-operation-boundary-lineage.mjs';

const id = digit => digit.repeat(64);
const row = { file: 'actual.ts', reason: 'unknown receiver', occurrences: 3 };
const report = () => ({
  baselineCount: 604,
  historicalBaselineSha256: id('a'),
  trustedCommit: 'b'.repeat(40),
  trustedTree: 'c'.repeat(40),
  newCount: 1,
  newEntries: [{ identity: id('1'), file: 'actual.ts' }],
  failingNewCount: 1,
  failingNewEntries: [{ identity: id('1'), file: 'actual.ts' }],
  incomplete: [{ ...row }, { ...row }],
  unresolvedIncomplete: [{ ...row }, { ...row }],
});

test('moving a failing operation to a fresh identity never earns acceptance', () => {
  const before = report(),
    after = report();
  after.newEntries[0] = { identity: id('2'), file: 'moved.ts' };
  after.failingNewEntries[0] = { ...after.newEntries[0] };
  const delta = compareOperationBoundaryLineage(before, after);
  assert.deepEqual(delta.introducedIdentities, [id('2')]);
  assert.deepEqual(delta.disappearedIdentitiesRequiringCorrespondence, [id('1')]);
  assert.deepEqual(delta.newlyFailingIdentities, [id('2')]);
  assert.equal(delta.acceptedNewIdentities, 0);
  assert.equal(delta.runtimeAdmission, false);
});

test('a reduced failure count requires proof even while the inventory identity remains', () => {
  const after = report();
  after.failingNewEntries = [];
  after.failingNewCount = 0;
  const delta = compareOperationBoundaryLineage(report(), after);
  assert.deepEqual(delta.noLongerFailingIdentitiesRequiringProof, [id('1')]);
  assert.deepEqual(delta.disappearedIdentitiesRequiringCorrespondence, []);
  assert.equal(delta.acceptedNewIdentities, 0);
});

test('identical duplicate diagnostics retain separate positions and their occurrence sums', () => {
  const after = report();
  after.incomplete.pop();
  const delta = compareOperationBoundaryLineage(report(), after);
  assert.deepEqual(delta.rawDiagnostics.changed[0].beforeIndices, [0, 1]);
  assert.deepEqual(delta.rawDiagnostics.changed[0].afterIndices, [0]);
  assert.equal(delta.rawDiagnostics.beforeOccurrences, 6);
  assert.equal(delta.rawDiagnostics.afterOccurrences, 3);
  assert.deepEqual(delta.unresolvedDiagnostics.changed, []);
});

test('changed occurrence multiplicity or extra evidence field is never normalized away', () => {
  const after = report();
  after.incomplete[0].occurrences = 4;
  after.incomplete[1].mountedFrom = 'another-entry.ts';
  const delta = compareOperationBoundaryLineage(report(), after);
  assert.equal(delta.rawDiagnostics.changed.length, 3);
  assert.equal(delta.rawDiagnostics.afterOccurrences, 7);
});

test('unchanged reports yield no artificial progress', () => {
  const delta = compareOperationBoundaryLineage(report(), report());
  assert.deepEqual(delta.introducedIdentities, []);
  assert.deepEqual(delta.noLongerFailingIdentitiesRequiringProof, []);
  assert.deepEqual(delta.rawDiagnostics.changed, []);
  assert.equal(delta.acceptedNewIdentities, 0);
});

test('a truncated failure report is not interpreted as removal of every obligation', () => {
  assert.throws(
    () =>
      compareOperationBoundaryLineage(report(), {
        status: 'incomplete',
        failingNewEntries: [],
      }),
    /incomplete inventory/u
  );
});

test('same native identity on several actual call nodes retains every raw inventory record', () => {
  const before = report();
  before.newEntries.push({ ...before.newEntries[0], callee: 'hash.update().update' });
  before.newCount++;
  const delta = compareOperationBoundaryLineage(before, report());
  assert.equal(delta.rawInventory.beforeRows, 2);
  assert.equal(delta.rawInventory.afterRows, 1);
  assert.equal(delta.rawInventory.changed.length, 1);
  assert.deepEqual(delta.disappearedIdentitiesRequiringCorrespondence, []);
  assert.equal(delta.acceptedNewIdentities, 0);
});

test('preserved operations newly invalidated by dependency mounts remain in the lineage', () => {
  const before = report();
  before.failingNewEntries.push({
    identity: id('9'),
    file: 'preserved.ts',
    mountedFrom: 'changed.ts',
  });
  before.failingNewCount++;
  const same = compareOperationBoundaryLineage(before, before);
  assert.deepEqual(same.retainedIdentities, [id('1'), id('9')]);
  assert.deepEqual(same.rawFailures.changed, []);
  assert.equal(same.acceptedNewIdentities, 0);
});

test('rejects changed baseline, duplicate or malformed failures and missing raw diagnostics', () => {
  for (const mutate of [
    after => {
      after.historicalBaselineSha256 = id('d');
    },
    after => {
      after.failingNewEntries.push({ ...after.failingNewEntries[0] });
      after.failingNewCount++;
    },
    after => {
      after.failingNewEntries[0].identity = 'malformed';
    },
    after => {
      delete after.incomplete;
    },
  ]) {
    const after = report();
    mutate(after);
    assert.throws(
      () => compareOperationBoundaryLineage(report(), after),
      /incomplete: operation lineage/u
    );
  }
});
