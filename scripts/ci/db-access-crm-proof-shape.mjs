import { digest } from './db-access-trust.mjs';

export const CRM_CONTRACT_ID = 's8-crm-integration-proof-v1';
export const failCrm = reason => {
  throw new Error('incomplete: crm proof ' + reason);
};
export const publicCrmRow = row =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
export function canonicalCrm(value) {
  if (Array.isArray(value)) return value.map(canonicalCrm);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalCrm(value[key])])
    );
  return value;
}
export const crmDigest = value => digest(JSON.stringify(canonicalCrm(value)));
export const crmDiagnosticKey = row => crmDigest([row.file, row.reason, row.occurrences]);
export function freezeCrm(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeCrm(child);
    Object.freeze(value);
  }
  return value;
}
function unique(values, label) {
  if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length)
    failCrm('invalid or duplicate ' + label);
}
export function validateCrmContract(contract) {
  if (
    contract.id !== CRM_CONTRACT_ID ||
    contract.version !== 1 ||
    contract.baselineCount !== 604 ||
    contract.runtimeRequired !== true ||
    contract.acceptedReceiptInputs !== false ||
    contract.runtimeAdmission !== false
  )
    failCrm('contract identity');
  const { operations, diagnostics } = contract.witnesses ?? {};
  if (
    !Array.isArray(operations) ||
    !operations.length ||
    !Array.isArray(diagnostics) ||
    !diagnostics.length
  )
    failCrm('missing finite witnesses');
  unique(
    operations.map(row => row.identity),
    'operation identities'
  );
  for (const row of operations) {
    if (typeof row.productionOperation !== 'boolean')
      failCrm('explicit operation classification required');
  }
  unique(diagnostics.map(crmDiagnosticKey), 'diagnostic identities');
  if (
    !contract.sources ||
    !Object.keys(contract.sources).length ||
    Object.keys(contract.sources).length > 2048
  )
    failCrm('finite source closure');
  const cases = new Map();
  for (const item of contract.cases ?? []) {
    if (
      !/^crm-[a-z0-9-]+$/u.test(item.id) ||
      cases.has(item.id) ||
      !['source-classification', 'runtime'].includes(item.kind)
    )
      failCrm('case identity');
    unique(item.files, 'case files');
    if (
      item.files.some(file => !Object.hasOwn(contract.sources, file)) ||
      typeof item.justification !== 'string' ||
      !item.justification.trim()
    )
      failCrm('unbound case source/justification');
    if (item.kind === 'runtime') unique(item.requiredAssertions, 'runtime assertions');
    cases.set(item.id, item);
  }
  if (!cases.size) failCrm('missing evidence cases');
  const used = new Set();
  for (const row of [...operations, ...diagnostics]) {
    if (!Object.hasOwn(contract.sources, row.file)) failCrm('unbound witness source');
    unique(row.caseIds, 'witness case mapping');
    for (const id of row.caseIds) {
      const item = cases.get(id);
      if (!item || !item.files.includes(row.file)) failCrm('missing witness case coverage');
      if (row.productionOperation === true && item.kind !== 'runtime')
        failCrm('production operation requires runtime');
      used.add(id);
    }
  }
  if ([...cases.keys()].some(id => !used.has(id))) failCrm('unmapped evidence case');
  const runtimeCases = [...cases.values()]
    .filter(item => item.kind === 'runtime')
    .map(item => item.id)
    .sort();
  if (
    !runtimeCases.length ||
    crmDigest(runtimeCases) !== crmDigest([...(contract.runtime?.requiredCases ?? [])].sort())
  )
    failCrm('mandatory runtime cases');
  for (const row of diagnostics)
    if (!Number.isSafeInteger(row.occurrences) || row.occurrences < 1)
      failCrm('diagnostic occurrences');
  return cases;
}
