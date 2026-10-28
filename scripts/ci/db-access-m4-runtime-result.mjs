import { validateM4MountedCompletion } from './db-access-m4-runtime-mounted-result.mjs';
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
  const contexts = report.assignmentContextConstruction;
  const profiles = new Set(),
    runtimeIds = new Set();
  let captured = 0;
  if (
    !contexts ||
    Object.keys(contexts).sort().join('|') !== 'assignmentContexts|closed' ||
    !Number.isSafeInteger(contexts.closed) ||
    !Array.isArray(contexts.assignmentContexts) ||
    contexts.assignmentContexts.length !== contexts.closed ||
    contexts.closed > 256
  )
    fail('actual local assignment owners');
  for (const owner of contexts.assignmentContexts) {
    if (
      Object.keys(owner).sort().join('|') !== 'localQualificationOnly|rows|runtimeId|version' ||
      !Number.isSafeInteger(owner.runtimeId) ||
      owner.runtimeId < 1 ||
      runtimeIds.has(owner.runtimeId) ||
      owner.version !== 1 ||
      owner.localQualificationOnly !== true ||
      !Array.isArray(owner.rows) ||
      owner.rows.length > 128
    )
      fail('actual assignment owner identity');
    runtimeIds.add(owner.runtimeId);
    for (const [index, row] of owner.rows.entries()) {
      if (
        Object.keys(row).sort().join('|') !==
          'capturedAfterPosture|configurationIdentityChecked|operationId|ordinal|profile|receiver|requestDigest|responseDigest|verifier' ||
        row.ordinal !== index + 1 ||
        !['ops', 'legacy-admin', 'legacy-agent', 'staff'].includes(row.profile) ||
        row.receiver !== 'posture-checked-owned-data-drizzle' ||
        row.verifier !== 'owned-current-store-identity-drizzle' ||
        row.configurationIdentityChecked !== true ||
        row.capturedAfterPosture !== true ||
        typeof row.operationId !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
          row.operationId
        ) ||
        typeof row.requestDigest !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(row.requestDigest) ||
        !(
          row.responseDigest === null ||
          (typeof row.responseDigest === 'string' && /^[a-f0-9]{64}$/u.test(row.responseDigest))
        )
      )
        fail('actual captured assignment configuration');
      profiles.add(row.profile);
      captured++;
    }
  }
  if (captured > 2048 || profiles.size !== 4) fail('complete fixed assignment family');
  return Object.freeze({
    privateCases: report.privateCases.length,
    profileCases: report.profileCases.length,
    total: contract.caseIDs.private.length + contract.caseIDs.profiles.length,
    privateCaseIds: Object.freeze(report.privateCases.map(row => row.id)),
    profileCaseIds: Object.freeze(report.profileCases.map(row => row.id)),
    completionValidated: true,
    assignmentContextConstruction: contexts,
    ...validateM4MountedCompletion(report, contexts, contract),
    runtimeAdmission: false,
    nativeAdmission: false,
  });
}
