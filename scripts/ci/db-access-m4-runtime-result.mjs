import { M4_RUNTIME_CONTRACT as contract } from './db-access-m4-runtime-contract.mjs';
const fail = reason => {
  throw Error('M4 runtime result refused: ' + reason);
};
// Shape validation is deliberately not an admission/freshness API.
export function validateM4RuntimeCompletion(report) {
  if (
    !report ||
    report.version !== 1 ||
    report.complete !== true ||
    report.setupComplete !== true ||
    report.cleanupComplete !== true ||
    report.remainingOwnedSessions !== 0 ||
    report.runtimeAdmission !== false ||
    report.nativeAdmission !== false
  )
    fail('completion/cleanup');
  for (const [key, ids] of [
    ['privateCases', contract.caseIDs.private],
    ['profileCases', contract.caseIDs.profiles],
  ]) {
    const rows = report[key];
    if (
      !Array.isArray(rows) ||
      rows.length !== ids.length ||
      rows.some(
        (row, index) =>
          !row ||
          row.id !== ids[index] ||
          row.passed !== true ||
          row.skipped ||
          row.cancelled ||
          row.todo
      )
    )
      fail('exact executed cases ' + key);
  }
  const m = report.minimalOpsPrivilegeDiagnostic;
  if (
    !m ||
    m.expectedMinimalGrants !== true ||
    m.positiveRows !== 1 ||
    m.forbiddenBranchSelectSqlstate !== '42501' ||
    m.roleGrantExpansion !== false
  )
    fail('minimal ops grants');
  return Object.freeze({
    privateCases: report.privateCases.length,
    profileCases: report.profileCases.length,
    total: 28,
    privateCaseIds: Object.freeze(report.privateCases.map(row => row.id)),
    profileCaseIds: Object.freeze(report.profileCases.map(row => row.id)),
    completionValidated: true,
    runtimeAdmission: false,
    nativeAdmission: false,
  });
}
