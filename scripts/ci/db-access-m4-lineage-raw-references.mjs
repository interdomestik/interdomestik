// Called only inside the existing native/runtime owner join, after worker validation.
// References every original array index; never substitutes a filtered native report.
export function describeLineageRawReferences(native, selection, nativeOutputDigest) {
  const byIdentity = new Map(),
    affectedFailureIndices = [];
  for (const entry of selection.entries) {
    const encoded = native.inventory.entries[entry.inventoryIndex];
    if (
      !encoded ||
      encoded.row.identity !== entry.identity ||
      JSON.stringify(encoded.owner) !== JSON.stringify(entry.owner)
    )
      throw Error('M4 lineage original inventory index changed');
    const prior = byIdentity.get(entry.identity) ?? [];
    prior.push(entry.inventoryIndex);
    byIdentity.set(entry.identity, prior);
  }
  for (const [index, row] of native.raw.failures.entries())
    if (byIdentity.has(row.identity)) affectedFailureIndices.push(index);
  const reference = (path, rows) => ({ path, start: 0, endExclusive: rows.length });
  return {
    version: 1,
    nativeOutputDigest,
    inventoryIndices: selection.entries.map(entry => entry.inventoryIndex),
    affectedFailureIndices,
    references: {
      inventory: reference('/inventory/entries', native.inventory.entries),
      allRawFailures: reference('/raw/failures', native.raw.failures),
      allRawDiagnostics: reference('/raw/diagnostics', native.raw.diagnostics),
      originalSelectedContexts: reference(
        '/rawGraph/m4Contexts/observations',
        native.rawGraph.m4Contexts.observations
      ),
      originalSelectedIdentities: reference(
        '/rawGraph/m4Contexts/selectedIdentities',
        native.rawGraph.m4Contexts.selectedIdentities
      ),
    },
    rawDiagnosticOccurrences: native.raw.diagnosticCount,
    failureMultiplicitySemantics: 'original rows retained verbatim; indices only, no regrouping',
    affectedDiagnosticAttribution: 'unresolved outside original selected-path axis',
    acceptedCoverage: 0,
    runtimeAdmission: false,
    allExecutableContextsQualified: false,
  };
}
