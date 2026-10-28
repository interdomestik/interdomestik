import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeFixture, sha } from './db-access-m4-compiled-context.fixture.mjs';
import { relateCompiledNativeOperations } from './db-access-m4-compiled-context-native.mjs';
const join = f => relateCompiledNativeOperations(f.native, f.requirements);
test('native relation retains exact indices, unknown frames and occurrences without mutation', () => {
  const f = nativeFixture(),
    before = JSON.stringify(f),
    result = join(f);
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].contextOccurrences, 2);
  assert.equal(result.references[0].emissionOccurrences, 2);
  assert.equal(result.acceptedRawOccurrences, 0);
  assert.deepEqual(result.acceptedOriginalIdentities, []);
});
const nativeMutants = {
  'foreign worker parsed model': f =>
    (f.native.rawGraph.m4Contexts.affectedLineage.batches[0].modelDigest = 'b'.repeat(64)),
  'foreign worker source policy': f =>
    (f.native.rawGraph.m4Contexts.affectedLineage.batches[0].sourcePolicyDigest = 'b'.repeat(64)),
  'missing required operation': f =>
    f.native.rawGraph.m4Contexts.affectedLineage.selection.entries.splice(0),
  'duplicate selected operation': f =>
    f.native.rawGraph.m4Contexts.affectedLineage.selection.entries.push(
      structuredClone(f.native.rawGraph.m4Contexts.affectedLineage.selection.entries[0])
    ),
  'foreign identity': f => (f.native.inventory.entries[0].row.identity = 'b'.repeat(64)),
  'foreign operation span': f => {
    f.native.inventory.entries[0].operation = [...f.native.inventory.entries[0].operation];
    f.native.inventory.entries[0].operation[1]++;
  },
  'owner-envelope membership is not execution': f =>
    f.native.rawGraph.m4Contexts.affectedLineage.batches[0].observations.splice(0),
  'duplicate native observation': f =>
    f.native.rawGraph.m4Contexts.affectedLineage.batches[0].observations.push(
      structuredClone(f.native.rawGraph.m4Contexts.affectedLineage.batches[0].observations[0])
    ),
  'missing referenced frame': f =>
    (f.native.rawGraph.m4Contexts.affectedLineage.batches[0].observations[0].context = 'absent'),
  'foreign frame argument': f => {
    let b = f.native.rawGraph.m4Contexts.affectedLineage.batches[0];
    b.observations[0].context = 'f';
    b.frames = [
      {
        id: 'f',
        status: 'available',
        bindings: [{ parameter: null, argument: null, callerFrame: null }],
      },
    ];
  },
  'orphan emission': f =>
    (f.native.rawGraph.m4Contexts.affectedLineage.batches[0].entryEmissions[0].observationKey =
      'b'.repeat(64)),
  'duplicate emission': f =>
    f.native.rawGraph.m4Contexts.affectedLineage.batches[0].entryEmissions.push(
      structuredClone(f.native.rawGraph.m4Contexts.affectedLineage.batches[0].entryEmissions[0])
    ),
  'emission exceeds actual observation': f =>
    (f.native.rawGraph.m4Contexts.affectedLineage.batches[0].entryEmissions[0].occurrences = 3),
  'unsafe integer multiplicity': f =>
    (f.native.rawGraph.m4Contexts.affectedLineage.batches[0].observations[0].occurrences =
      Number.MAX_SAFE_INTEGER + 1),
  'missing root partition': f => f.native.rawGraph.m4Contexts.roots.push('unseen.ts'),
  'empty required T': f => (f.requirements.operations = []),
};
for (const [name, mutate] of Object.entries(nativeMutants))
  test(name, () => {
    const f = nativeFixture();
    mutate(f);
    assert.throws(() => join(f), /M4 compiled context correspondence refused/);
  });
