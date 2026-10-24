import assert from 'node:assert/strict';
import test from 'node:test';
import { captureStatusReturnPriorRow } from './db-access-status-return-equivalence.mjs';
import { clone, fixture, policy, run } from './db-access-status-return-equivalence-fixture.mjs';

test('future runtime CONTRACT fixture removes only the corresponding old return and preserves native observations', () => {
  const f = fixture(),
    before = clone({ prepared: f.prepared, graph: f.graph }),
    failures = clone(f.failures);
  const result = run(f);
  assert.equal(result.status, 'classified', JSON.stringify(result));
  assert.equal(result.kind, 'preserved-debt-source-correspondence');
  assert.equal(result.runtimeAdmission, false);
  assert.deepEqual(result.requiredRuntimeCases, [policy.runtime.caseId]);
  failures.delete(policy.currentRow.identity);
  assert.deepEqual(f.failures, failures);
  assert.deepEqual(clone({ prepared: f.prepared, graph: f.graph }), before);
  assert.ok(Buffer.isBuffer(f.prepared.baselineBytes));
});
test('explicit CRM10 fixture holds the old return because new notification runtime is absent', () => {
  const f = fixture({ futureRuntimeContract: false }),
    before = clone(f.failures);
  const result = run(f);
  assert.equal(result.status, 'held');
  assert.match(result.reason, /notification runtime case missing/);
  assert.deepEqual(f.failures, before);
});
test('prior observation capture accepts only one exact native old identity and strips AST-private fields', () => {
  assert.deepEqual(
    captureStatusReturnPriorRow([{ ...clone(policy.priorRow), _node: {} }]),
    policy.priorRow
  );
  assert.equal(captureStatusReturnPriorRow([]), undefined);
  assert.equal(captureStatusReturnPriorRow([policy.priorRow, policy.priorRow]), undefined);
});
const runtimeCase = f =>
  f.prepared.providerUnit.crmProof.cases.find(item => item.id === policy.runtime.caseId);
const negatives = [
  ['changed finalize source', f => f.prepared.sources.set(policy.currentRow.file, 'changed')],
  [
    'changed auth/scope helper',
    f => f.prepared.sources.set('packages/domain-claims/src/staff-claims/scope.ts', 'return true'),
  ],
  [
    'changed notifier transaction',
    f => f.prepared.sources.set(policy.runtime.files[1], 'return ambient'),
  ],
  [
    'changed store tenant predicate',
    f => f.prepared.sources.set(policy.runtime.files[2], 'foreign tenant'),
  ],
  [
    'new module initialization effect',
    f =>
      f.prepared.sources.set(
        'packages/domain-claims/src/support-handoffs/staff-scope.ts',
        'globalThis.leaked = tx'
      ),
  ],
  [
    'changed original source',
    f => f.prepared.trusted.set(policy.currentRow.file, 'foreign original'),
  ],
  [
    'changed baseline bytes',
    f => {
      f.prepared.baselineBytes = Buffer.from('changed');
    },
  ],
  ['changed baseline count', f => f.prepared.baseline.entries.pop()],
  ['expanded provider boundary', f => f.prepared.providerFiles.add(policy.currentRow.file)],
  [
    'changed provider implementation',
    f => f.prepared.sources.set(policy.providerFiles[0], 'changed'),
  ],
  [
    'added resolver target',
    f => f.prepared.moduleTargets.dependencies.get(policy.currentRow.file).add('new-target.ts'),
  ],
  [
    'removed dependency',
    f => f.prepared.moduleTargets.dependencies.get(policy.currentRow.file).clear(),
  ],
  [
    'missing old native row',
    f => {
      f.priorRow = undefined;
    },
  ],
  [
    'old row has no historical debt',
    f => {
      f.priorRow.historicalDebt = false;
    },
  ],
  [
    'old row classified differently',
    f => {
      f.priorRow.tenantPosture = 'unclassified';
    },
  ],
  [
    'new native operation in bound file',
    f =>
      f.prepared.inventory.entries.push({
        ...clone(policy.currentRow),
        identity: 'new-operation',
      }),
  ],
  ['duplicate native operation', f => f.prepared.inventory.entries.push(clone(policy.currentRow))],
  [
    'new classification',
    f => {
      f.prepared.inventory.entries.find(row => row.identity === policy.currentRow.identity).reason =
        'changed';
    },
  ],
  ['missing current failure', f => f.failures.delete(policy.currentRow.identity)],
  [
    'different current failure reason',
    f => {
      f.failures.get(policy.currentRow.identity).reason = 'actual new failure';
    },
  ],
  [
    'new caller mount',
    f =>
      f.graph.failures.push({
        ...clone(policy.currentRow),
        mountedFrom: 'new-root.ts',
      }),
  ],
  ['missing caller mount', f => f.graph.failures.pop()],
  [
    'changed mounted classification',
    f => {
      f.graph.failures[0].tenantPosture = 'unclassified';
    },
  ],
  [
    'runtime replaced by source classification',
    f => {
      runtimeCase(f).kind = 'source-classification';
    },
  ],
  ['missing runtime assertion', f => runtimeCase(f).requiredAssertions.pop()],
  ['missing runtime source file', f => runtimeCase(f).files.pop()],
  [
    'runtime case optional',
    f => {
      f.prepared.providerUnit.crmProof.runtime.requiredCases = [];
    },
  ],
  [
    'duplicate runtime case',
    f => f.prepared.providerUnit.crmProof.cases.push(clone(runtimeCase(f))),
  ],
  [
    'runtime input absent',
    f => {
      f.prepared.providerUnit.crmProof.runtime.expectedInputs = [];
    },
  ],
  [
    'runtime input digest changed',
    f => {
      f.prepared.providerUnit.crmProof.sources[policy.runtime.files[1]].sha256 = '0'.repeat(64);
    },
  ],
  [
    'runtime enforcement disabled',
    f => {
      f.prepared.providerPolicy.runtimeEnforcement.mode = 'optional';
    },
  ],
  [
    'receipts accepted',
    f => {
      f.prepared.providerUnit.crmProof.acceptedReceiptInputs = true;
    },
  ],
  [
    'runtime admission forged',
    f => {
      f.prepared.providerUnit.crmProof.runtimeAdmission = true;
    },
  ],
];
for (const [label, mutate] of negatives)
  test(label + ' preserves the complete verdict map', () => {
    const f = fixture();
    mutate(f);
    const before = clone(f.failures);
    const result = run(f);
    assert.equal(result.status, 'held', JSON.stringify(result));
    assert.deepEqual(result.operations, []);
    assert.deepEqual(f.failures, before);
  });
test('a different epoch receives no correspondence', () => {
  const f = fixture();
  f.prepared.adoption.commit = '0'.repeat(40);
  const before = clone(f.failures);
  assert.equal(run(f).status, 'not-applicable');
  assert.deepEqual(f.failures, before);
});

test('unit CRM10 and CRM11 fixtures stay stable when the repository already has CRM11', () => {
  const positive = fixture();
  const original = positive.prepared.providerUnit.crmProof;
  assert.deepEqual(fixture({ original }), positive);
  const absent = fixture({ original, futureRuntimeContract: false });
  assert.deepEqual(run(absent), run(fixture({ futureRuntimeContract: false })));
  assert.equal(
    absent.prepared.providerUnit.crmProof.cases.filter(item => item.id === policy.runtime.caseId)
      .length,
    0
  );
});
