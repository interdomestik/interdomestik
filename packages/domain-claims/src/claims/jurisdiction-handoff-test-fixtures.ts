export const tx = {} as never;

export const baseClaim = {
  branchId: 'branch-a',
  incidentCountryCode: 'MK',
  lifecycleVersion: 7,
  recoveryLegalTenantId: null,
  staffId: 'staff-1',
};

export const baseParams = {
  actor: { branchId: 'branch-a', id: 'staff-1', role: 'staff' },
  claimId: 'claim-1',
  grantActorId: 'local-legal-1',
  homeTenantId: 'tenant_ks',
  now: new Date('2026-06-19T10:00:00Z'),
};

export const preWriteCases = [
  ['unsupported_incident_jurisdiction', { ...baseClaim, incidentCountryCode: 'ZZ' }, baseParams],
  ['actor_not_authorized', baseClaim, { ...baseParams, actor: { id: 'member-1', role: 'member' } }],
  [
    'actor_not_authorized',
    baseClaim,
    { ...baseParams, actor: { branchId: 'branch-b', id: 'manager-1', role: 'branch_manager' } },
  ],
] as const;

export const preGrantCases = [
  ['self_grant_denied', baseParams, undefined],
  ['grant_actor_not_recovery_tenant', { ...baseParams, grantActorId: 'other-local' }, false],
] as const;

export const rollbackCases = [
  ['active_grant_conflict', 'handoff_active_grant_conflict'],
  ['correlation_conflict', 'handoff_correlation_conflict'],
  ['expired_exists', 'handoff_grant_expired'],
  ['revoked_exists', 'handoff_grant_revoked'],
] as const;
