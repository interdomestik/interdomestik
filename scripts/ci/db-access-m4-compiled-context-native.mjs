// Exact subset/reference relation; raw contexts and multiplicities are never rewritten.
import { lineageObservationKey } from './db-access-m4-factory-context-rule.mjs';
import {
  same,
  positive,
  locator,
  one,
  fail,
  add,
  digest,
  hex,
} from './db-access-m4-compiled-context-common.mjs';
function frameClosure(batch, id, seen = new Set()) {
  if (id === null) return [];
  if (seen.has(id)) fail('recursive referenced frame');
  seen.add(id);
  const row = one(batch.frames, value => value.id === id, 'native frame');
  if (!['available', 'unavailable', 'recursive'].includes(row.status)) fail('native frame status');
  const result = [{ id, status: row.status, bindings: row.bindings ?? null }];
  if (row.status === 'available') {
    if (!Array.isArray(row.bindings)) fail('native frame bindings');
    for (const binding of row.bindings) {
      if (!locator(binding.parameter) || (binding.argument !== null && !locator(binding.argument)))
        fail('native frame locator');
      result.push(...frameClosure(batch, binding.callerFrame, new Set(seen)));
    }
  }
  // Open/unavailable frames are retained as such, never converted to runtime bindings.
  return result;
}
export function relateCompiledNativeOperations(native, requirements) {
  const census = native.rawGraph.m4Contexts,
    lineage = census.affectedLineage;
  if (
    !same(
      lineage.batches.flatMap(batch => batch.roots),
      census.roots
    ) ||
    new Set(census.roots).size !== census.roots.length
  )
    fail('complete native root partition');
  if (!hex(census.modelDigest) || !hex(native.modelDigest))
    fail('separate native model digest encodings');
  for (const batch of lineage.batches)
    if (
      batch.modelDigest !== census.modelDigest ||
      batch.sourcePolicyDigest !== native.sourcePolicyDigest ||
      !same(batch.sourceBookends, native.sourceBookends)
    )
      fail('actual worker parsed-model/source binding');
  const requiredKeys = new Set(),
    references = [];
  for (const operation of requirements.operations) {
    const key = JSON.stringify(operation.operation);
    if (requiredKeys.has(key)) fail('duplicate required operation');
    requiredKeys.add(key);
    const selected = one(
      lineage.selection.entries,
      row => same(row.operation, operation.operation),
      'required native operation'
    );
    const entry = native.inventory.entries[selected.inventoryIndex];
    if (
      !entry ||
      entry.row.identity !== selected.identity ||
      entry.row.file !== operation.file ||
      entry.row.method !== operation.method ||
      !same(entry.operation, operation.operation) ||
      !same(entry.owner, operation.owner) ||
      !same(selected.owner, operation.owner)
    )
      fail('native source operation/owner');
    const observations = [],
      emissions = [];
    for (const [batchIndex, batch] of lineage.batches.entries()) {
      const keys = new Set();
      for (const [observationIndex, row] of batch.observations.entries()) {
        if (!row.inventoryIndices.includes(selected.inventoryIndex)) continue;
        const observationKey = lineageObservationKey(row);
        if (
          keys.has(observationKey) ||
          !positive(row.occurrences) ||
          !same(row.owner, operation.owner)
        )
          fail('native observation identity/multiplicity');
        keys.add(observationKey);
        observations.push({
          batchIndex,
          observationIndex,
          observationKey,
          occurrences: row.occurrences,
          origin: row.origin,
          invocation: row.invocation,
          outcome: row.outcome,
          context: row.context,
          definingContext: row.definingContext,
          frames: [
            ...frameClosure(batch, row.context),
            ...frameClosure(batch, row.definingContext),
          ],
          disposition: 'retained generic native observation; no actual-runtime frame substitution',
        });
      }
      const emissionKeys = new Set();
      for (const [emissionIndex, row] of batch.entryEmissions.entries()) {
        if (row.inventoryIndex !== selected.inventoryIndex) continue;
        const key = JSON.stringify([row.observationKey, row.kind, row.reason]);
        if (
          emissionKeys.has(key) ||
          !keys.has(row.observationKey) ||
          row.identity !== selected.identity ||
          !positive(row.occurrences) ||
          !['entry-incomplete', 'entry-unsafe'].includes(row.kind) ||
          !observations.some(
            obs =>
              obs.batchIndex === batchIndex &&
              obs.observationKey === row.observationKey &&
              obs.origin === row.origin
          )
        )
          fail('orphan/duplicate native emission');
        const observation = observations.find(
          obs => obs.batchIndex === batchIndex && obs.observationKey === row.observationKey
        );
        if (row.occurrences > observation.occurrences)
          fail('emission exceeds actual observation multiplicity');
        emissionKeys.add(key);
        emissions.push({
          batchIndex,
          emissionIndex,
          ...row,
          disposition: 'retained raw multiplicity; zero subtraction',
        });
      }
    }
    if (!observations.length) fail('nonempty actual native operation observations');
    references.push({
      ...operation,
      inventoryIndex: selected.inventoryIndex,
      identity: selected.identity,
      observations,
      emissions,
      contextOccurrences: observations.reduce((n, row) => add(n, row.occurrences), 0),
      emissionOccurrences: emissions.reduce((n, row) => add(n, row.occurrences), 0),
      wholeOriginalIdentityQualified: false,
      allocatedRawOccurrences: 0,
    });
  }
  if (!references.length) fail('nonempty native T relation');
  return {
    references,
    requiredOperationCount: references.length,
    retainedReferenceSha256: digest(references),
    rawArrayMutation: false,
    sourceDataBinding: {
      workerModelJSONDigest: census.modelDigest,
      nativeModelOutputShapeDigest: native.modelDigest,
      sourcePolicyDigest: native.sourcePolicyDigest,
      sourceBookends: native.sourceBookends,
      authority:
        'existing private native Git/model source proof + actual worker request/result/STOP ACK; not loader inspection upgrade',
    },
    acceptedOriginalIdentities: [],
    acceptedRawOccurrences: 0,
  };
}
