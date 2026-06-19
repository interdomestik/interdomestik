import { vi } from 'vitest';

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
  grantActorResolver: vi.fn(async () => ({ role: 'staff', tenantId: 'tenant_mk' })),
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
  [
    'handoff_grant_expired',
    { ...baseParams, grantExpiresAt: new Date('2026-06-19T09:59:59Z') },
    undefined,
  ],
  ['handoff_grant_expired', { ...baseParams, grantExpiresAt: baseParams.now }, undefined],
  [
    'grant_actor_not_recovery_tenant',
    {
      ...baseParams,
      grantActorResolver: vi.fn(async () => ({ role: 'member', tenantId: 'tenant_mk' })),
    },
    false,
  ],
  [
    'grant_actor_not_recovery_tenant',
    {
      ...baseParams,
      grantActorResolver: vi.fn(async () => ({ role: 'staff', tenantId: 'tenant_ks' })),
    },
    false,
  ],
] as const;

export const rollbackCases = [
  ['active_grant_conflict', 'handoff_active_grant_conflict'],
  ['correlation_conflict', 'handoff_correlation_conflict'],
  ['expiry_conflict', 'handoff_grant_expiry_conflict'],
  ['expired_exists', 'handoff_grant_expired'],
  ['revoked_exists', 'handoff_grant_revoked'],
] as const;
