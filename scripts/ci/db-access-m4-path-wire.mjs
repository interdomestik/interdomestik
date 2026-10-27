import { m4ObservationKey, m4AttributionKey } from './db-access-m4-context-attribution.mjs';
import { M4_PATH_LIMITS } from './db-access-m4-path-limits.mjs';
import { createM4PathLocatorCheck } from './db-access-m4-path-locators.mjs';

const fail = reason => {
  throw Error('incomplete: M4 path transport ' + reason);
};
const shape = (row, names) =>
  row &&
  typeof row === 'object' &&
  !Array.isArray(row) &&
  Object.keys(row).sort().join('|') === names.split(' ').sort().join('|');
const integer = n => Number.isSafeInteger(n) && n >= 0;
const add = (a, b) => {
  if (!integer(b) || !integer(a + b)) fail('multiplicity overflow');
  return a + b;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function table(rows, name, limit) {
  if (!Array.isArray(rows) || rows.length > limit) fail(name + ' capacity');
  const result = new Map();
  rows.forEach((row, index) => {
    if (row?.id !== name + ':' + index) fail(name + ' identity');
    result.set(row.id, row);
  });
  return result;
}

// Caller has already validated the exact batch source, observations and old attributions.
// This is additive owned-worker data validation, never a capability constructor.
export function validateM4PathDiagnostics(batch, result, model) {
  const path = batch.pathDiagnostics;
  if (
    !shape(
      path,
      'version selections frames scopes records counters outsideScopeApplicability runtimeAdmission allExecutableContextsQualified'
    ) ||
    path.version !== 1 ||
    path.outsideScopeApplicability !== 'unresolved' ||
    path.runtimeAdmission !== false ||
    path.allExecutableContextsQualified !== false
  )
    fail('missing/foreign path data');
  const selections = table(path.selections, 'selection', M4_PATH_LIMITS.metadata);
  const frames = table(path.frames, 'frame', M4_PATH_LIMITS.metadata);
  const scopes = table(path.scopes, 'scope', M4_PATH_LIMITS.scopes);
  if (
    selections.size + frames.size > M4_PATH_LIMITS.metadata ||
    !Array.isArray(path.records) ||
    path.records.length > M4_PATH_LIMITS.records
  )
    fail('metadata/record capacity');
  const observations = new Map(batch.observations.map(row => [m4ObservationKey(row), row]));
  for (const row of selections.values()) {
    const keys = row.observationKeys;
    if (
      !shape(row, 'id observationKeys') ||
      !Array.isArray(keys) ||
      !keys.length ||
      new Set(keys).size !== keys.length ||
      !same(keys, [...keys].sort()) ||
      keys.some(key => !observations.has(key))
    )
      fail('foreign selection');
  }
  const locators = createM4PathLocatorCheck(model);
  const frameReference = value => {
    if (value !== null && !frames.has(value)) fail('foreign frame');
  };
  for (const row of frames.values()) {
    if (row.status === 'available') {
      if (!shape(row, 'id status bindings') || !Array.isArray(row.bindings)) fail('frame shape');
      for (const binding of row.bindings) {
        if (!shape(binding, 'parameter argument callerFrame')) fail('binding shape');
        locators.add(binding.parameter);
        locators.add(binding.argument);
        frameReference(binding.callerFrame);
      }
    } else if (!shape(row, 'id status') || !['unavailable', 'recursive'].includes(row.status))
      fail('unknown frame status');
  }
  const roots = new Set(batch.roots);
  for (const row of scopes.values()) {
    if (
      !shape(
        row,
        'id selectionId origin emitterOwner invocation traversalContext definingContext evaluationContext evaluationSite evaluationContextStatus'
      ) ||
      !selections.has(row.selectionId) ||
      !roots.has(row.origin) ||
      !['explicit-channel-context', 'traversal-context-only'].includes(row.evaluationContextStatus)
    )
      fail('scope shape/origin');
    if (
      selections
        .get(row.selectionId)
        .observationKeys.some(key => observations.get(key).origin !== row.origin)
    )
      fail('foreign observation origin');
    locators.add(row.emitterOwner, true);
    locators.add(row.invocation);
    locators.add(row.evaluationSite, row.evaluationContextStatus === 'explicit-channel-context');
    if (
      row.evaluationContextStatus === 'traversal-context-only' &&
      (row.evaluationSite !== null || row.evaluationContext !== row.traversalContext)
    )
      fail('invented evaluation context');
    [row.traversalContext, row.definingContext, row.evaluationContext].forEach(frameReference);
  }
  const legacy = new Map(
    batch.attributions
      .filter(row => row.kind !== 'entry-unsafe')
      .map(row => [m4AttributionKey(row), row])
  );
  const overlap = new Map(),
    claims = new Map(),
    records = new Set(),
    usedScopes = new Set();
  let selected = 0,
    overlapping = 0;
  for (const row of path.records) {
    if (
      !shape(row, 'scopeId diagnosticKey legacyDiagnosticKey occurrences') ||
      !scopes.has(row.scopeId) ||
      typeof row.diagnosticKey !== 'string' ||
      !integer(row.occurrences) ||
      row.occurrences < 1
    )
      fail('record shape');
    const scope = scopes.get(row.scopeId);
    let key;
    try {
      key = JSON.parse(row.diagnosticKey);
    } catch {
      fail('diagnostic key');
    }
    if (
      !Array.isArray(key) ||
      key.length !== 2 ||
      key[0] !== scope.origin ||
      JSON.stringify(key) !== row.diagnosticKey
    )
      fail('foreign diagnostic origin/key');
    const recordKey = JSON.stringify([row.scopeId, row.diagnosticKey, row.legacyDiagnosticKey]);
    if (records.has(recordKey)) fail('replayed record');
    records.add(recordKey);
    usedScopes.add(row.scopeId);
    selected = add(selected, row.occurrences);
    claims.set(row.diagnosticKey, add(claims.get(row.diagnosticKey) ?? 0, row.occurrences));
    if (row.legacyDiagnosticKey !== null) {
      const old = legacy.get(row.legacyDiagnosticKey);
      if (
        !old ||
        JSON.stringify([old.origin, old.reason]) !== row.diagnosticKey ||
        !same(old.owner, scope.emitterOwner) ||
        !same(old.invocation, scope.invocation) ||
        old.observationKeys.some(
          key => !selections.get(scope.selectionId).observationKeys.includes(key)
        )
      )
        fail('foreign legacy overlap');
      overlapping = add(overlapping, row.occurrences);
      overlap.set(
        row.legacyDiagnosticKey,
        add(overlap.get(row.legacyDiagnosticKey) ?? 0, row.occurrences)
      );
    }
  }
  for (const [key, row] of legacy)
    if ((overlap.get(key) ?? 0) !== row.occurrences) fail('omitted/replayed legacy overlap');
  if (usedScopes.size !== scopes.size) fail('unreferenced scope');
  const counter = path.counters;
  if (
    !shape(
      counter,
      'collectorInitialRawCount collectorFinalRawCount wrappedOccurrences selectedPathOccurrences legacyOverlapOccurrences additionalPathOccurrences offPathOccurrences pushCalls storage'
    ) ||
    Object.entries(counter).some(([key, value]) => key !== 'storage' && !integer(value)) ||
    !shape(counter.storage, 'encodedBytes scopes records metadata') ||
    Object.values(counter.storage).some(n => !integer(n))
  )
    fail('counter shape');
  if (
    counter.collectorFinalRawCount - counter.collectorInitialRawCount !==
      counter.wrappedOccurrences ||
    counter.wrappedOccurrences !== add(selected, counter.offPathOccurrences) ||
    counter.selectedPathOccurrences !== selected ||
    counter.legacyOverlapOccurrences !== overlapping ||
    counter.additionalPathOccurrences !== selected - overlapping ||
    !integer(result.incompleteRawCount) ||
    counter.collectorFinalRawCount > result.incompleteRawCount ||
    counter.storage.scopes !== scopes.size ||
    counter.storage.records !== path.records.length ||
    counter.storage.metadata !== selections.size + frames.size ||
    counter.storage.encodedBytes > M4_PATH_LIMITS.encodedBytes
  )
    fail('counter/capacity mismatch');
  if (!Array.isArray(result.incomplete)) fail('original diagnostic array');
  let encodedMinimum = 0;
  for (const rows of [path.selections, path.frames, path.scopes, path.records])
    for (const row of rows)
      encodedMinimum = add(encodedMinimum, Buffer.byteLength(JSON.stringify(row), 'utf8'));
  if (encodedMinimum > counter.storage.encodedBytes) fail('underreported encoded metadata');
  // Count only finite claimed keys; the existing merge still validates every original row.
  const available = new Map(),
    origins = new Set([...scopes.values()].map(row => row.origin));
  if (claims.size)
    for (const row of result.incomplete) {
      if (!origins.has(row.file)) continue;
      const key = JSON.stringify([row.file, row.reason]);
      if (claims.has(key)) available.set(key, add(available.get(key) ?? 0, row.occurrences ?? 1));
    }
  for (const [key, n] of claims)
    if (n > (available.get(key) ?? 0)) fail('path count exceeds original');
  locators.finish();
  return path;
}
