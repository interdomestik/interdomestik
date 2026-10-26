// Pure diagnostic projection only. This module cannot authenticate, brand or admit inputs.
// The existing private pair validates its runtime/native owners before calling this helper.
const count = value => (Array.isArray(value) ? value.length : null);
const integer = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);
const reference = (path, rows) => ({ path, start: 0, endExclusive: count(rows) });
function occurrences(rows) {
  if (!Array.isArray(rows)) return null;
  let total = 0;
  for (const row of rows) {
    const value = integer(row?.occurrences);
    if (value === null || value === 0 || !Number.isSafeInteger(total + value)) return null;
    total += value;
  }
  return total;
}

// Native arrays remain in the owned session. Half-open ranges refer to every original
// index, including unresolved rows; no filtered copy or duplicated per-row index is built.
export function describeM4PairGaps(native, nativeOutputDigest, runtime) {
  const census = native.rawGraph.m4Contexts;
  return {
    version: 1,
    kind: 'm4-live-pair-gap-ledger',
    nativeOutputDigest,
    sourcePolicyDigest: native.sourcePolicyDigest,
    authorityDigest: native.authorityDigest,
    runtimeContextSha256: runtime.contextSha256,
    runtimePolicySha256: runtime.policySha256,
    counts: {
      inventoryEntries: count(native.inventory.entries),
      selectedIdentities: count(census?.selectedIdentities),
      contextTuples: count(census?.observations),
      contextOccurrences: occurrences(census?.observations),
      rawFailureRows: count(native.raw.failures),
      rawDiagnosticTuples: count(native.raw.diagnostics),
      rawDiagnosticOccurrences: integer(native.raw.diagnosticCount),
      unresolvedContextTuples: count(census?.unresolved),
      runtimePrivateCases: integer(runtime.completion?.privateCases),
      runtimeProfileCases: integer(runtime.completion?.profileCases),
    },
    references: {
      inventory: reference('/inventory/entries', native.inventory.entries),
      selectedIdentities: reference(
        '/rawGraph/m4Contexts/selectedIdentities',
        census?.selectedIdentities
      ),
      contexts: reference('/rawGraph/m4Contexts/observations', census?.observations),
      rawFailures: reference('/raw/failures', native.raw.failures),
      diagnosticTuples: reference('/raw/diagnostics', native.raw.diagnostics),
      unresolvedContexts: reference('/rawGraph/m4Contexts/unresolved', census?.unresolved),
    },
    unmappedRelations: [
      {
        relation: 'source-effects-to-runtime-cases',
        missing:
          'No complete source-effect to executed-case/assertion mapping is bound to this pair.',
      },
      {
        relation: 'historical-to-current-lineage',
        missing:
          'No complete old/current identity, legacy-mount or domain-effect lineage is bound.',
      },
      {
        relation: 'native-contexts-to-diagnostic-tuples',
        missing:
          'No complete identity/context/owner/invocation/dispatch/diagnostic relation is bound.',
      },
      {
        relation: 'ordinary-execution-to-source-contexts',
        missing:
          'No protected ordinary-execution handle and loader/source-context relation is bound.',
      },
      {
        relation: 'deployment-and-loader-contexts',
        missing: 'No complete deployment/image/loader context authority is bound to this pair.',
      },
    ],
    countSemantics:
      'Null means absent or invalid source count; tuples and occurrences stay distinct.',
    acceptedCoverage: 0,
    runtimeEvidenceAccepted: false,
    runtimeAdmission: false,
    nativeAdmission: false,
    allExecutableContextsQualified: false,
    productionCCredit: 0,
  };
}
