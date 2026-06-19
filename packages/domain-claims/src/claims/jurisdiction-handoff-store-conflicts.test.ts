import { describe, expect, it } from 'vitest';

import { classifyExistingHandoffGrant } from './jurisdiction-handoff-store-conflicts';

const args = {
  actorId: 'local-legal-1',
  caseId: 'claim-1',
  correlationId: 'corr-1',
  expiresAt: null,
  grantId: 'grant-1',
  homeTenantId: 'tenant_ks',
  now: new Date('2026-06-19T10:00:00Z'),
  recoveryLegalTenantId: 'tenant_mk',
};

const sameGrant = {
  accessTenantId: 'tenant_mk',
  actorId: 'local-legal-1',
  caseId: 'claim-1',
  correlationId: 'corr-1',
  expiresAt: null,
  id: 'grant-1',
  revokedAt: null,
  tenantId: 'tenant_ks',
};

describe('classifyExistingHandoffGrant', () => {
  it('classifies expired deterministic replay as a conflict instead of success', () => {
    expect(
      classifyExistingHandoffGrant(
        { ...sameGrant, expiresAt: new Date('2026-06-19T09:59:59Z') },
        args
      )
    ).toBe('expired_exists');
  });

  it('keeps active deterministic replay idempotent', () => {
    const expiresAt = new Date('2026-06-19T10:00:01Z');

    expect(classifyExistingHandoffGrant({ ...sameGrant, expiresAt }, { ...args, expiresAt })).toBe(
      'already_exists'
    );
  });

  it('classifies changed deterministic replay expiry as a conflict', () => {
    expect(
      classifyExistingHandoffGrant(
        { ...sameGrant, expiresAt: new Date('2026-06-19T10:00:01Z') },
        { ...args, expiresAt: null }
      )
    ).toBe('expiry_conflict');
  });
});
