// DATA ONLY. Existing owned worker transport authenticates results before this check.
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = reason => {
  throw Error('M4 lineage wire refused: ' + reason);
};
const keys = (value, names) =>
  value &&
  typeof value === 'object' &&
  Object.keys(value).sort().join('|') === names.split(' ').sort().join('|');
const outcomes = new Set(['visited', 'recursion', 'graph-bound', 'provider-boundary']);
export function validateLineageBatch(batch, selection, binding, roots, validLocator) {
  if (
    !keys(
      batch,
      'version sourcePolicyDigest sourceBookends modelDigest roots selection observations frames observationSha256 metadataBytes diagnosticAttribution acceptedCoverage runtimeAdmission allExecutableContextsQualified entryEmissions'
    ) ||
    batch.version !== 1 ||
    batch.sourcePolicyDigest !== binding.sourcePolicyDigest ||
    !same(batch.sourceBookends, binding.sourceBookends) ||
    batch.modelDigest !== binding.modelDigest ||
    !same(batch.roots, roots) ||
    !same(batch.selection, selection.description) ||
    batch.runtimeAdmission !== false ||
    batch.allExecutableContextsQualified !== false ||
    batch.acceptedCoverage !== 0 ||
    batch.diagnosticAttribution !== 'unresolved-outside-original-selected-path-axis' ||
    !Number.isSafeInteger(batch.metadataBytes) ||
    batch.metadataBytes < 0 ||
    batch.metadataBytes > 32 * 1024 * 1024 ||
    !Array.isArray(batch.frames) ||
    !Array.isArray(batch.observations)
  )
    fail('binding/roots/selection/limits');
  const owners = new Map(
    [...selection.owners.values()].map(value => [JSON.stringify(value.owner), value])
  );
  const frames = new Set(batch.frames.map(row => row.id)),
    seen = new Set();
  if (frames.size !== batch.frames.length) fail('duplicate frame');
  const frame = id => id === null || frames.has(id);
  for (const [index, row] of batch.frames.entries()) {
    if (
      row.id !== 'lineage-frame:' + index ||
      !['available', 'unavailable', 'recursive'].includes(row.status) ||
      (row.status === 'unavailable'
        ? Object.hasOwn(row, 'bindings')
        : !Array.isArray(row.bindings) ||
          row.bindings.some(
            value =>
              !keys(value, 'parameter argument callerFrame') ||
              !validLocator(value.parameter) ||
              !validLocator(value.argument) ||
              !frame(value.callerFrame)
          ))
    )
      fail('frame/AST');
  }
  for (const row of batch.observations) {
    const selected = owners.get(JSON.stringify(row.owner));
    if (
      !keys(
        row,
        'origin owner invocation context definingContext outcome inventoryIndices memberships dispatchClassification occurrences'
      ) ||
      !selected ||
      !roots.includes(row.origin) ||
      !validLocator(row.invocation) ||
      !frame(row.context) ||
      !frame(row.definingContext) ||
      !outcomes.has(row.outcome) ||
      row.dispatchClassification !== 'no-additional-state-query' ||
      !same(
        row.inventoryIndices,
        selected.entries.map(entry => entry.inventoryIndex)
      ) ||
      !same(row.memberships, selected.memberships) ||
      !Number.isSafeInteger(row.occurrences) ||
      row.occurrences < 1
    )
      fail('owner/context/multiplicity');
    const key = JSON.stringify(
      Object.fromEntries(Object.entries(row).filter(([name]) => name !== 'occurrences'))
    );
    if (seen.has(key)) fail('duplicate uncompacted observation');
    seen.add(key);
  }
  if (hash(JSON.stringify(batch.observations)) !== batch.observationSha256)
    fail('observation digest');
  const contextKeys = new Map(
    batch.observations.map(row => [
      hash(
        JSON.stringify(
          Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'occurrences'))
        )
      ),
      row,
    ])
  );
  const selectedEntries = new Map(
    selection.description.entries.map(row => [row.inventoryIndex, row])
  );
  const emissionKeys = new Set();
  const emittedByContextEntry = new Map();
  if (!Array.isArray(batch.entryEmissions)) fail('missing original entry emissions');
  for (const row of batch.entryEmissions) {
    const observation = contextKeys.get(row.observationKey),
      entry = selectedEntries.get(row.inventoryIndex);
    if (
      !keys(row, 'observationKey inventoryIndex identity origin kind reason occurrences') ||
      !observation ||
      !entry ||
      entry.identity !== row.identity ||
      !observation.inventoryIndices.includes(row.inventoryIndex) ||
      observation.origin !== row.origin ||
      !['entry-incomplete', 'entry-unsafe'].includes(row.kind) ||
      typeof row.reason !== 'string' ||
      !Number.isSafeInteger(row.occurrences) ||
      row.occurrences < 1 ||
      row.occurrences > observation.occurrences ||
      (row.kind === 'entry-incomplete' && (!entry.incomplete || entry.reason !== row.reason))
    )
      fail('entry emission/context/index/source binding');
    const key = JSON.stringify([row.observationKey, row.inventoryIndex, row.kind, row.reason]);
    if (emissionKeys.has(key)) fail('duplicate entry emission');
    emissionKeys.add(key);
    const entryKey = JSON.stringify([row.observationKey, row.inventoryIndex]);
    const list = emittedByContextEntry.get(entryKey) ?? [];
    list.push(row);
    emittedByContextEntry.set(entryKey, list);
  }
  for (const [observationKey, observation] of contextKeys)
    if (observation.outcome === 'visited')
      for (const index of observation.inventoryIndices) {
        const entry = selectedEntries.get(index);
        if (!entry?.incomplete) continue;
        const rows = (
          emittedByContextEntry.get(JSON.stringify([observationKey, index])) ?? []
        ).filter(row => row.kind === 'entry-incomplete' && row.reason === entry.reason);
        if (rows.length !== 1 || rows[0].occurrences !== observation.occurrences)
          fail('incomplete original entry emission conservation');
      }
  return batch; // Validated data remains non-admitting; no new handle exists here.
}
