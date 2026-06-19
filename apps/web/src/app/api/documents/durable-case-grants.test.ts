import { describe, expect, it, vi } from 'vitest';

import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';

type GrantDbMock = { select: ReturnType<typeof vi.fn> };

function dbWithGrantRows(rows: unknown[]): GrantDbMock {
  const chain = { where: vi.fn().mockResolvedValue(rows) };
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    }),
  };
}

const activeLegalGrant = {
  accessTenantId: 'tenant_mk',
  actorId: 'local-legal-1',
  caseId: 'claim-1',
  documentClasses: ['legal', 'evidence'],
  expiresAt: null,
  revokedAt: null,
};

const request = {
  accessTenantId: 'tenant_mk',
  actorId: 'local-legal-1',
  caseId: 'claim-1',
  documentClass: 'legal' as const,
  now: new Date('2026-06-19T10:00:00Z'),
};

describe('hasDurableCaseScopedDocumentGrant', () => {
  it('allows active durable grants for the actor, access tenant, case, and document class', async () => {
    await expect(
      hasDurableCaseScopedDocumentGrant({
        ...request,
        db: dbWithGrantRows([activeLegalGrant]) as never,
      })
    ).resolves.toBe(true);
  });

  it.each([
    ['wrong case', { ...activeLegalGrant, caseId: 'claim-2' }],
    ['wrong access tenant', { ...activeLegalGrant, accessTenantId: 'tenant_ks' }],
    ['wrong actor', { ...activeLegalGrant, actorId: 'other-actor' }],
    ['wrong document class', { ...activeLegalGrant, documentClasses: ['evidence'] }],
    ['expired grant', { ...activeLegalGrant, expiresAt: '2026-06-19T09:59:59Z' }],
    ['revoked grant', { ...activeLegalGrant, revokedAt: '2026-06-19T09:00:00Z' }],
    ['unapproved identity grant row', { ...activeLegalGrant, documentClasses: ['identity'] }],
  ])('denies %s', async (_label, grant) => {
    await expect(
      hasDurableCaseScopedDocumentGrant({
        ...request,
        db: dbWithGrantRows([grant]) as never,
      })
    ).resolves.toBe(false);
  });

  it('denies unapproved document classes before durable rows can broaden access', async () => {
    const db = dbWithGrantRows([{ ...activeLegalGrant, documentClasses: ['identity'] }]);

    await expect(
      hasDurableCaseScopedDocumentGrant({
        ...request,
        db: db as never,
        documentClass: 'identity',
      })
    ).resolves.toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });
});
