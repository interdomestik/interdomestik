import { describe, expect, it } from 'vitest';

import { canUseCaseScopedDocumentGrant, type CaseScopedAccessGrant } from './access-grants';

const grant: CaseScopedAccessGrant = {
  accessTenantId: 'tenant_access',
  actorId: 'actor-local-legal',
  caseId: 'claim-1',
  documentClasses: ['evidence', 'legal'],
  expiresAt: '2026-07-01T00:00:00.000Z',
};

const now = new Date('2026-06-16T00:00:00.000Z');

describe('canUseCaseScopedDocumentGrant', () => {
  it('allows only named case and approved document classes inside the access tenant', () => {
    expect(
      canUseCaseScopedDocumentGrant({
        accessTenantId: 'tenant_access',
        actorId: 'actor-local-legal',
        caseId: 'claim-1',
        documentClass: 'legal',
        grants: [grant],
        now,
      })
    ).toBe(true);

    for (const denied of [
      { caseId: 'claim-2', documentClass: 'legal' as const },
      { caseId: 'claim-1', documentClass: 'medical' as const },
    ]) {
      expect(
        canUseCaseScopedDocumentGrant({
          accessTenantId: 'tenant_access',
          actorId: 'actor-local-legal',
          grants: [grant],
          now,
          ...denied,
        })
      ).toBe(false);
    }
  });

  it('does not derive access from legal, recovery, host, booking, or ambient tenant values', () => {
    expect(
      canUseCaseScopedDocumentGrant({
        accessTenantId: 'tenant_legal',
        actorId: 'actor-local-legal',
        caseId: 'claim-1',
        documentClass: 'legal',
        grants: [grant],
        now,
      })
    ).toBe(false);
  });

  it('normalizes identifier whitespace before matching grants', () => {
    expect(
      canUseCaseScopedDocumentGrant({
        accessTenantId: ' tenant_access ',
        actorId: ' actor-local-legal ',
        caseId: ' claim-1 ',
        documentClass: 'legal',
        grants: [{ ...grant, accessTenantId: ' tenant_access ', caseId: ' claim-1 ' }],
        now,
      })
    ).toBe(true);
  });

  it('rejects revoked or expired grants', () => {
    expect(
      canUseCaseScopedDocumentGrant({
        accessTenantId: 'tenant_access',
        actorId: 'actor-local-legal',
        caseId: 'claim-1',
        documentClass: 'legal',
        grants: [
          { ...grant, revokedAt: now },
          { ...grant, expiresAt: '2026-01-01T00:00:00Z' },
        ],
        now,
      })
    ).toBe(false);
  });

  it('rejects blank access, actor, or case identifiers', () => {
    for (const denied of [
      { accessTenantId: '', actorId: 'actor-local-legal', caseId: 'claim-1' },
      { accessTenantId: 'tenant_access', actorId: '', caseId: 'claim-1' },
      { accessTenantId: 'tenant_access', actorId: 'actor-local-legal', caseId: '' },
    ]) {
      expect(
        canUseCaseScopedDocumentGrant({
          documentClass: 'legal',
          grants: [{ ...grant, ...denied }],
          now,
          ...denied,
        })
      ).toBe(false);
    }
  });
});
