import {
  crmDigest,
  CRM_CONTRACT_ID,
  failCrm,
  validateCrmContract,
} from './db-access-crm-proof-shape.mjs';

export function validateCrmRuntimeResult(report, contract) {
  validateCrmContract(contract);
  if (
    contract.id !== CRM_CONTRACT_ID ||
    report?.version !== 1 ||
    report.setupComplete !== true ||
    report.teardownComplete !== true ||
    report.runtimeAdmission !== false ||
    !Number.isSafeInteger(report.postgres) ||
    report.postgres < 160000 ||
    report.postgres >= 170000 ||
    !Array.isArray(report.cases)
  )
    failCrm('runtime completion');
  const expected = contract.cases.filter(item => item.kind === 'runtime');
  if (report.cases.length !== expected.length) failCrm('runtime case count');
  const seen = new Set();
  for (const result of report.cases) {
    const specification = expected.find(item => item.id === result.id);
    if (
      !specification ||
      seen.has(result.id) ||
      result.status !== 'passed' ||
      !Array.isArray(result.assertions) ||
      new Set(result.assertions).size !== result.assertions.length ||
      crmDigest([...result.assertions].sort()) !==
        crmDigest([...specification.requiredAssertions].sort())
    )
      failCrm('runtime case/assertions');
    seen.add(result.id);
  }
  const coverage = contract.witnesses.operations
    .filter(row => row.productionOperation)
    .map(row => {
      if (row.caseIds.some(id => !seen.has(id))) failCrm('runtime operation coverage');
      return { identity: row.identity, caseIds: row.caseIds };
    });
  return {
    contractId: contract.id,
    contractSha256: crmDigest(contract),
    cases: report.cases,
    coverage,
    coverageSha256: crmDigest(coverage),
    setupComplete: true,
    teardownComplete: true,
    postgres: report.postgres,
    runtimeAdmission: false,
  };
}
