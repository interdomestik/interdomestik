import assert from 'node:assert/strict';
import test from 'node:test';
import { retainMountedLineage } from './db-access-m4-mounted-lineage.mjs';
import { lineageObservationKey } from './db-access-m4-factory-context-rule.mjs';
function fixture() {
  const observation = { origin: 'caller.ts', inventoryIndices: [0], occurrences: 7 };
  const emission = {
    observationKey: lineageObservationKey(observation),
    inventoryIndex: 0,
    identity: 'original',
    origin: 'caller.ts',
    kind: 'entry-incomplete',
    reason: 'unknown',
    occurrences: 7,
  };
  return {
    inventory: { entries: [{ row: { identity: 'original', file: 'adapter.ts' } }] },
    rawGraph: {
      m4Contexts: {
        affectedLineage: {
          selection: { entries: [{ inventoryIndex: 0, identity: 'original' }] },
          batches: [{ observations: [observation], entryEmissions: [emission] }],
        },
      },
    },
  };
}
test('actual emission and occurrence references remain residual without ordinal allocation', () => {
  const native = fixture(),
    before = JSON.stringify(native);
  const result = retainMountedLineage(native, ['adapter.ts']);
  assert.equal(result.emissions[0].occurrences, 7);
  assert.equal(
    result.emissions[0].observationKey,
    native.rawGraph.m4Contexts.affectedLineage.batches[0].entryEmissions[0].observationKey
  );
  assert.equal(result.acceptedOriginalOccurrences, 0);
  assert.deepEqual(result.acceptedOriginalIdentities, []);
  assert.equal(JSON.stringify(native), before);
});
for (const [name, mutate] of [
  ['foreign identity', n => (n.inventory.entries[0].row.identity = 'other')],
  [
    'foreign observation',
    n =>
      (n.rawGraph.m4Contexts.affectedLineage.batches[0].entryEmissions[0].observationKey = 'other'),
  ],
  [
    'lost multiplicity',
    n => (n.rawGraph.m4Contexts.affectedLineage.batches[0].entryEmissions[0].occurrences = 0),
  ],
])
  test(name + ' refuses', () => {
    const native = fixture();
    mutate(native);
    assert.throws(() => retainMountedLineage(native, ['adapter.ts']));
  });
