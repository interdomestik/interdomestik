import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantTx: null as GrantDbMock | null,
  withTenantContext: vi.fn(
    async (_context: unknown, action: (tx: GrantDbMock) => Promise<unknown>) => {
      if (!mocks.tenantTx) throw new Error('tenantTx not configured');
      return action(mocks.tenantTx);
    }
  ),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: mocks.withTenantContext,
}));

import {
  findActorCrossGrantContexts,
  hasDurableCaseScopedDocumentGrant,
} from './durable-case-grants';

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

function expectGrantContext(): void {
  expect(mocks.withTenantContext).toHaveBeenCalledWith(
    { tenantId: 'tenant_mk', accessTenantId: 'tenant_mk' },
    expect.any(Function)
  );
}

describe('hasDurableCaseScopedDocumentGrant', () => {
  beforeEach(() => {
    mocks.tenantTx = null;
    mocks.withTenantContext.mockClear();
  });

  it('allows active durable grants for the actor, access tenant, case, and document class', async () => {
    mocks.tenantTx = dbWithGrantRows([activeLegalGrant]);
    await expect(
      hasDurableCaseScopedDocumentGrant({
        ...request,
        db: dbWithGrantRows([]) as never,
      })
    ).resolves.toBe(true);
    expectGrantContext();
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
    mocks.tenantTx = dbWithGrantRows([grant]);
    await expect(
      hasDurableCaseScopedDocumentGrant({
        ...request,
        db: dbWithGrantRows([]) as never,
      })
    ).resolves.toBe(false);
    expectGrantContext();
  });

  it('denies unapproved document classes before durable rows can broaden access', async () => {
    const db = dbWithGrantRows([{ ...activeLegalGrant, documentClasses: ['identity'] }]);
    mocks.tenantTx = db;

    await expect(
      hasDurableCaseScopedDocumentGrant({
        ...request,
        db: db as never,
        documentClass: 'identity',
      })
    ).resolves.toBe(false);
    expect(db.select).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('uses tenant context when listing cross-tenant grant lookup contexts', async () => {
    mocks.tenantTx = dbWithGrantRows([{ ...activeLegalGrant, tenantId: 'tenant_home' }]);

    await expect(
      findActorCrossGrantContexts({
        accessTenantId: 'tenant_mk',
        actorId: 'local-legal-1',
        db: dbWithGrantRows([]) as never,
        now: request.now,
      })
    ).resolves.toEqual([
      {
        caseId: 'claim-1',
        documentClasses: ['legal', 'evidence'],
        homeTenantId: 'tenant_home',
      },
    ]);
    expectGrantContext();
  });
});
