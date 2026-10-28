// Fixed data for the four source-owned assignment families.
export const PROFILES = Object.freeze([
  {
    profile: 'ops',
    factory: 'createM4OpsAssignmentController',
    entry: 'assignClaimOwnerInTransaction',
    role: 'kernel',
    witnesses: [
      'ops-claim-snapshot-audit-values',
      'ops-assignment-row-and-response-time',
      'ops-exact-audit-payload',
      'ops-audit-insert-failure-rollback',
      'ops-target-role-reread',
    ],
  },
  {
    profile: 'legacy-admin',
    factory: 'createM4LegacyAdminAssignmentController',
    entry: 'assignLegacyAdminInTransaction',
    role: 'legacy',
    witnesses: [
      'legacy-assignment-field-preservation',
      'legacy-audit-observation-fields',
      'r3-legacy-mandatory-audit-rollback',
      'controller-legacy-replay-entry-conflict',
    ],
  },
  {
    profile: 'legacy-agent',
    factory: 'createM4LegacyAgentAssignmentController',
    entry: 'assignLegacyAgentInTransaction',
    role: 'legacy',
    witnesses: [
      'r3-agent-terminal-denial',
      'r3-agent-active-noop-audit',
      'r3-shared-nonstaff-eligibility',
    ],
  },
  {
    profile: 'staff',
    factory: 'createM4StaffAssignmentController',
    entry: 'assignStaffInTransaction',
    role: 'staff',
    witnesses: [
      'staff-omitted-target-self',
      'staff-null-clears-metadata',
      'staff-branch-target-denial',
      'staff-eligible-terminal-self-and-null-noops',
    ],
  },
]);
