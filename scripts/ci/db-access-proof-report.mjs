const publicEntry = entry =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith('_')));

export function proofReport({
  inventory,
  namedProofFiles,
  messageObligations,
  crmObligations,
  producerHarnessFiles,
  providerEntries,
  providerPolicy,
}) {
  const { remaining: _remaining, ...crmReport } = crmObligations;
  return {
    crmProofObligations: crmReport,
    messageProofObligations: {
      operations: messageObligations.operations.map(entry => ({
        ...publicEntry(entry),
        historicalDebt: false,
        runtimeAdmission: false,
        obligation: 's8-message-integration-proof-v1',
      })),
      unknown: messageObligations.unknown,
      runtimeAdmission: false,
    },
    namedProofObligations: inventory.entries
      .filter(entry => namedProofFiles.has(entry.file))
      .map(entry => ({
        ...publicEntry(entry),
        historicalDebt: false,
        runtimeAdmission: false,
        obligation: providerPolicy.namedProof.id,
        sourceSha256: providerPolicy.namedProof.files[entry.file].sha256,
      })),
    producerHarnessObligations: [...producerHarnessFiles].map(file => ({
      file,
      sha256: providerPolicy.runtimeFiles[file].sha256,
      obligation: 'fixed-provider-runtime-proof-harness',
      historicalDebt: false,
      runtimeAdmission: false,
    })),
    obligations: providerEntries.map(entry => ({
      ...publicEntry(entry),
      historicalDebt: false,
      obligation: 'fixed-provider-runtime',
    })),
  };
}
