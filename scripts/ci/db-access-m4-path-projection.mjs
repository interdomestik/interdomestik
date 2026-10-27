import { inspectM4ContextNamespace } from './db-access-m4-context-index.mjs';

const fail = reason => {
  throw Error('incomplete: M4 selected path inspection ' + reason);
};
const add = (a, b) => {
  if (!Number.isSafeInteger(b) || b < 0 || !Number.isSafeInteger(a + b)) fail('count');
  return a + b;
};

// Pure finite projection from the SAME already-validated native view. No new owner call.
export function describeM4SelectedPathInspection(native) {
  const path = native.rawGraph?.m4Contexts?.pathDiagnostics;
  if (
    path?.version !== 1 ||
    !Array.isArray(path.batches) ||
    path.outsideScopeApplicability !== 'unresolved' ||
    path.runtimeAdmission !== false ||
    path.allExecutableContextsQualified !== false
  )
    fail('missing owned path projection');
  const claims = new Map();
  const totals = {
    wrappedOccurrences: 0,
    selectedPathOccurrences: 0,
    legacyOverlapOccurrences: 0,
    additionalPathOccurrences: 0,
    offPathOccurrences: 0,
    pushCalls: 0,
    scopes: 0,
    records: 0,
    frames: 0,
    selections: 0,
    encodedBytes: 0,
  };
  path.batches.forEach((batch, batchIndex) => {
    const data = batch.diagnostics;
    for (const key of [
      'wrappedOccurrences',
      'selectedPathOccurrences',
      'legacyOverlapOccurrences',
      'additionalPathOccurrences',
      'offPathOccurrences',
      'pushCalls',
    ])
      totals[key] = add(totals[key], data.counters[key]);
    for (const key of ['scopes', 'records', 'frames', 'selections'])
      totals[key] = add(totals[key], data[key].length);
    totals.encodedBytes = add(totals.encodedBytes, data.counters.storage.encodedBytes);
    data.records.forEach((row, recordIndex) => {
      const claim = claims.get(row.diagnosticKey) ?? {
        key: row.diagnosticKey,
        recordReferences: [],
        claimedOccurrences: 0,
        legacyOverlapOccurrences: 0,
      };
      claim.recordReferences.push({ batchIndex, recordIndex });
      claim.claimedOccurrences = add(claim.claimedOccurrences, row.occurrences);
      if (row.legacyDiagnosticKey !== null)
        claim.legacyOverlapOccurrences = add(claim.legacyOverlapOccurrences, row.occurrences);
      claims.set(row.diagnosticKey, claim);
    });
  });
  if (
    totals.selectedPathOccurrences !==
      add(totals.legacyOverlapOccurrences, totals.additionalPathOccurrences) ||
    totals.wrappedOccurrences !== add(totals.selectedPathOccurrences, totals.offPathOccurrences)
  )
    fail('axis/counter mismatch');
  let claimed = 0,
    overlap = 0;
  for (const row of claims.values()) {
    claimed = add(claimed, row.claimedOccurrences);
    overlap = add(overlap, row.legacyOverlapOccurrences);
  }
  if (claimed !== totals.selectedPathOccurrences || overlap !== totals.legacyOverlapOccurrences)
    fail('record/counter mismatch');
  return {
    version: 1,
    relation: 'diagnostics-emitted-while-observed-selected-contexts-were-active',
    batches: path.batches,
    totals,
    diagnostics: {
      graphDiagnostics: inspectM4ContextNamespace(
        native.rawGraph.incomplete,
        '/rawGraph/incomplete',
        claims,
        false,
        true
      ),
      rawDiagnostics: inspectM4ContextNamespace(
        native.raw.diagnostics,
        '/raw/diagnostics',
        claims,
        false,
        false
      ),
      reportDiagnostics: inspectM4ContextNamespace(
        native.report.incomplete,
        '/report/incomplete',
        claims,
        false,
        false
      ),
    },
    outsideScopeApplicability: 'unresolved',
    countSemantics:
      'Selected path counts INCLUDE legacy diagnostic overlap; never add the two axes. Multiple active observations share one emission. Batch-local frame/scope IDs have no cross-worker equivalence. Initial, late and unmatched diagnostics retain unresolved applicability.',
    acceptedCoverage: 0,
    runtimeAdmission: false,
    nativeAdmission: false,
    allExecutableContextsQualified: false,
    productionCCredit: 0,
  };
}
