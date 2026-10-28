// Data only, called after native/private owners authenticate the unchanged arrays.
import { lineageObservationKey } from './db-access-m4-factory-context-rule.mjs';
const fail = () => {
  throw Error('M4 mounted lineage refused');
};
export function retainMountedLineage(native, sourceFiles) {
  const lineage = native.rawGraph.m4Contexts.affectedLineage;
  const files = new Set(sourceFiles),
    entries = [],
    observations = [],
    emissions = [];
  for (const selected of lineage.selection.entries) {
    const entry = native.inventory.entries[selected.inventoryIndex];
    if (!entry || entry.row.identity !== selected.identity) fail();
    if (files.has(entry.row.file))
      entries.push({ inventoryIndex: selected.inventoryIndex, identity: selected.identity });
  }
  const indices = new Set(entries.map(row => row.inventoryIndex));
  for (const [batchIndex, batch] of lineage.batches.entries()) {
    const observed = new Map();
    for (const [observationIndex, row] of batch.observations.entries()) {
      const key = lineageObservationKey(row);
      if (observed.has(key)) fail();
      observed.set(key, observationIndex);
      if (row.inventoryIndices.some(index => indices.has(index)))
        observations.push({
          batchIndex,
          observationIndex,
          observationKey: key,
          occurrences: row.occurrences,
          disposition: 'retained-native-context',
        });
    }
    for (const [emissionIndex, row] of batch.entryEmissions.entries()) {
      if (!indices.has(row.inventoryIndex)) continue;
      if (
        !observed.has(row.observationKey) ||
        native.inventory.entries[row.inventoryIndex]?.row.identity !== row.identity
      )
        fail();
      if (!Number.isSafeInteger(row.occurrences) || row.occurrences < 1) fail();
      emissions.push({
        batchIndex,
        emissionIndex,
        inventoryIndex: row.inventoryIndex,
        identity: row.identity,
        observationKey: row.observationKey,
        origin: row.origin,
        kind: row.kind,
        reason: row.reason,
        observationIndex: observed.get(row.observationKey),
        occurrences: row.occurrences,
        disposition: 'retained-native-emission',
      });
    }
  }
  return {
    namespace: 'current-fresh-native-source',
    historicalOriginalCohortReused: false,
    entries,
    observations,
    emissions,
    acceptedOriginalIdentities: [],
    acceptedOriginalOccurrences: 0,
    allocation: 'none; local construction is not an old native aggregate',
    otherOriginalContexts: 'retained',
  };
}
