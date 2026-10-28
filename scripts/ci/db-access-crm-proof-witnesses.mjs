import {
  crmDiagnosticKey,
  crmDigest,
  failCrm,
  publicCrmRow,
} from './db-access-crm-proof-shape.mjs';

// Validate the complete observed boundary before changing the provisional residual.
export function classifyCrmWitnesses(contract, context) {
  const { failures, incomplete, mountEvidence, newEntries, scannedCount, baselineCount } = context;
  if (!(failures instanceof Map) || !Array.isArray(incomplete))
    failCrm('invalid observed witnesses');
  if (
    baselineCount !== 604 ||
    scannedCount !== contract.inventory.scannedCount ||
    newEntries.length !== contract.inventory.newCount ||
    crmDigest(newEntries.map(publicCrmRow)) !== contract.inventory.newEntriesDigest
  )
    failCrm('inventory drift');
  if (crmDigest(mountEvidence) !== crmDigest(contract.witnesses.mountEvidence))
    failCrm('root or mounted operation drift');
  const operations = [];
  for (const expected of contract.witnesses.operations) {
    const actual = failures.get(expected.identity);
    if (
      !actual ||
      ['file', 'line', 'method', 'callee', 'reason'].some(key => actual[key] !== expected[key])
    )
      failCrm('operation witness drift ' + expected.identity);
    operations.push({
      ...publicCrmRow(actual),
      caseIds: expected.caseIds,
      productionOperation: expected.productionOperation,
      historicalDebt: false,
      runtimeAdmission: false,
      obligation: contract.id,
    });
  }
  const remaining = [],
    diagnostics = [],
    expected = new Map(contract.witnesses.diagnostics.map(row => [crmDiagnosticKey(row), row]));
  for (const actual of incomplete) {
    const key = crmDiagnosticKey(actual),
      witness = expected.get(key);
    if (!witness) {
      remaining.push(actual);
      continue;
    }
    expected.delete(key);
    diagnostics.push({
      ...actual,
      caseIds: witness.caseIds,
      runtimeAdmission: false,
      obligation: contract.id,
    });
  }
  if (expected.size) failCrm('missing or changed diagnostic witness');
  // Commit only once every identity/root/source-dependent witness has matched.
  for (const row of operations) failures.delete(row.identity);
  return {
    operations,
    diagnostics,
    remaining,
    runtimeAdmission: false,
    contractDigest: crmDigest(contract),
    inventoryDigest: contract.inventory.newEntriesDigest,
    mountDigest: crmDigest(mountEvidence),
    diagnosticDigest: crmDigest(contract.witnesses.diagnostics),
    requiredCases: contract.runtime.requiredCases,
  };
}
