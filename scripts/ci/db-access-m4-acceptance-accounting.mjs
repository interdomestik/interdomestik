// Exact original namespaces remain unchanged. Only contextual claims are added.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = reason => {
  throw Error('M4 acceptance accounting refused: ' + reason);
};
const add = (a, b) => {
  if (!Number.isSafeInteger(b) || b < 0 || !Number.isSafeInteger(a + b))
    fail('multiplicity overflow');
  return a + b;
};
const key = (file, reason) => JSON.stringify([file, reason]);
const ref = (path, rows) => ({ path, start: 0, endExclusive: rows.length });
export function accountAcceptedFactoryContexts(native, decisions) {
  const accepted = decisions.filter(row => row.accepted),
    acceptedIds = new Set(accepted.map(row => row.identity));
  const diagnosticClaims = new Map();
  for (const decision of accepted)
    for (const emission of decision.emissions) {
      const id = key(emission.origin, emission.reason),
        previous = diagnosticClaims.get(id) ?? {
          key: id,
          indices: [],
          originalOccurrences: 0,
          acceptedOccurrences: 0,
        };
      previous.acceptedOccurrences = add(previous.acceptedOccurrences, emission.occurrences);
      diagnosticClaims.set(id, previous);
    }
  for (const [index, row] of native.raw.diagnostics.entries()) {
    const claim = diagnosticClaims.get(key(row.file, row.reason));
    if (!claim) continue;
    claim.indices.push(index);
    claim.originalOccurrences = add(claim.originalOccurrences, row.occurrences ?? 1);
  }
  for (const claim of diagnosticClaims.values()) {
    if (!claim.indices.length || claim.acceptedOccurrences > claim.originalOccurrences)
      fail('accepted emissions exceed original diagnostic key group');
    claim.retainedOccurrences = claim.originalOccurrences - claim.acceptedOccurrences;
    claim.allocation = 'original key group only; no invented per-row causal allocation';
  }
  const failureIndices = [];
  for (const [index, row] of native.raw.failures.entries())
    if (acceptedIds.has(row.identity)) failureIndices.push(index);
  const census = native.rawGraph.m4Contexts;
  const original55 = census.selectedIdentities;
  if (original55.some(id => acceptedIds.has(id)))
    fail('fixed factory class widened to original T cohort');
  let acceptedContextOccurrences = 0;
  const acceptedContexts = accepted.flatMap(row => row.contexts);
  for (const row of acceptedContexts)
    acceptedContextOccurrences = add(acceptedContextOccurrences, row.occurrences);
  const acceptedDiagnosticOccurrences = [...diagnosticClaims.values()].reduce(
    (n, row) => add(n, row.acceptedOccurrences),
    0
  );
  if (acceptedDiagnosticOccurrences > native.raw.diagnosticCount)
    fail('original total occurrence conservation');
  const fullyCoveredDiagnosticIndices = [...diagnosticClaims.values()].flatMap(row =>
    row.retainedOccurrences === 0 ? row.indices : []
  );
  return {
    acceptedOriginalIdentities: [...acceptedIds],
    acceptedOriginalInventoryIndices: accepted.map(row => row.inventoryIndex),
    acceptedContexts,
    acceptedContextOccurrences,
    acceptedOriginalRawFailureIndices: failureIndices,
    diagnosticKeyGroups: [...diagnosticClaims.values()],
    retainedFactoryContexts: decisions.filter(row => !row.accepted).flatMap(row => row.contexts),
    retainedFactoryIdentities: decisions.filter(row => !row.accepted).map(row => row.identity),
    originalSelectedCohort: {
      identities: ref('/rawGraph/m4Contexts/selectedIdentities', original55),
      contexts: ref('/rawGraph/m4Contexts/observations', census.observations),
      contextOccurrences: census.observations.reduce((n, row) => add(n, row.occurrences), 0),
      disposition:
        'all retained; no fixed trusted-effect/premise construction is granted by this P2 class',
    },
    originals: {
      inventory: ref('/inventory/entries', native.inventory.entries),
      rawFailures: ref('/raw/failures', native.raw.failures),
      rawDiagnostics: ref('/raw/diagnostics', native.raw.diagnostics),
      rawDiagnosticOccurrences: native.raw.diagnosticCount,
    },
    residuals: {
      inventory: {
        originalCount: native.inventory.entries.length,
        acceptedIndices: accepted.map(row => row.inventoryIndex),
        retainedCount: native.inventory.entries.length - accepted.length,
      },
      rawFailures: {
        originalCount: native.raw.failures.length,
        acceptedIndices: failureIndices,
        retainedCount: native.raw.failures.length - failureIndices.length,
      },
      rawDiagnostics: {
        originalTuples: native.raw.diagnostics.length,
        fullyCoveredIndices: fullyCoveredDiagnosticIndices,
        retainedTuples: native.raw.diagnostics.length - fullyCoveredDiagnosticIndices.length,
        acceptedOccurrences: acceptedDiagnosticOccurrences,
        retainedOccurrences: native.raw.diagnosticCount - acceptedDiagnosticOccurrences,
      },
    },
    ordinaryReportUnchanged: true,
    residualMeaning:
      'every original index remains; accepted subsets are explicit references, all complements remain residual',
    nativeAdmission: false,
    productionCCredit: 0,
    wholeGuardPass: false,
  };
}
