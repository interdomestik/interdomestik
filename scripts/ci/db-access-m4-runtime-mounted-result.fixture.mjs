// Explicit synthetic shape data. No runtime or native authority is created by this fixture.
export function mountedCompletionFixture(contract) {
  const profiles = ['ops', 'legacy-admin', 'legacy-agent', 'staff'];
  const assignmentContexts = profiles.map((profile, index) => ({
    runtimeId: index + 1,
    version: 1,
    localQualificationOnly: true,
    rows: [
      {
        ordinal: 1,
        profile,
        receiver: 'posture-checked-owned-data-drizzle',
        verifier: 'owned-current-store-identity-drizzle',
        configurationIdentityChecked: true,
        capturedAfterPosture: true,
        operationId: '11111111-1111-4111-8111-' + String(index + 1).padStart(12, '0'),
        requestDigest: 'a'.repeat(64),
        responseDigest: 'b'.repeat(64),
      },
    ],
  }));
  const owners = assignmentContexts.slice(1).map(({ runtimeId, ...contexts }) => {
    const row = contexts.rows[0];
    return {
      version: 1,
      localQualificationOnly: true,
      runtimeId,
      contexts,
      transport: {
        rows: [
          {
            profile: row.profile,
            path: '/m4/assignment/' + row.profile,
            operationId: row.operationId,
            requestDigest: row.requestDigest,
            responseDigest: row.responseDigest,
            outcome: 'completed',
            delivery: 'finished',
          },
        ],
      },
    };
  });
  const cases = owners.map((owner, index) => {
    const row = owner.transport.rows[0];
    return {
      caseId: contract.caseIDs.mounted[index],
      profile: row.profile,
      runtimeId: owner.runtimeId,
      operationId: row.operationId,
      requestDigest: row.requestDigest,
      responseDigest: row.responseDigest,
      wrapperResultDigest: 'c'.repeat(64),
      outcome: 'completed',
      delivery: 'finished',
      responseProvenance: 'owned-server',
      cachePaths: Array(row.profile === 'staff' ? 8 : 24).fill('/synthetic/unit-only'),
    };
  });
  return {
    version: 1,
    complete: true,
    setupComplete: true,
    cleanupComplete: true,
    remainingOwnedSessions: 0,
    runtimeAdmission: false,
    nativeAdmission: false,
    privateCases: contract.caseIDs.private.map(id => ({ id, passed: true })),
    profileCases: contract.caseIDs.profiles.map(id => ({ id, passed: true })),
    assignmentContextConstruction: { closed: assignmentContexts.length, assignmentContexts },
    mountedAssignments: { version: 1, owners, cases },
    minimalOpsPrivilegeDiagnostic: {
      expectedMinimalGrants: true,
      positiveRows: 1,
      forbiddenBranchSelectSqlstate: '42501',
      roleGrantExpansion: false,
    },
  };
}
