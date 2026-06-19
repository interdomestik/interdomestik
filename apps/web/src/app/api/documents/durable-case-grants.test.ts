import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  findActorCrossGrantContexts,
  hasDurableCaseScopedDocumentGrant,
} from './durable-case-grants';

type GrantDbMock = { execute?: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> };

function dbWithGrantRows(rows: unknown[]): GrantDbMock {
  const chain = { where: vi.fn().mockResolvedValue(rows) };
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    }),
  };
}

function transactionalDbWithRows(rows: unknown[]) {
  const tx = { ...dbWithGrantRows(rows), execute: vi.fn().mockResolvedValue(undefined) };
  return {
    tx,
    db: {
      transaction: vi.fn(async (action: (innerTx: GrantDbMock) => Promise<unknown>) => action(tx)),
    },
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows active durable grants for the actor, access tenant, case, and document class', async () => {
    const db = dbWithGrantRows([activeLegalGrant]);
    await expect(
      hasDurableCaseScopedDocumentGrant({
        ...request,
        db: db as never,
      })
    ).resolves.toBe(true);
    expect(db.select).toHaveBeenCalledTimes(1);
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
    const db = dbWithGrantRows([grant]);
    await expect(
      hasDurableCaseScopedDocumentGrant({
        ...request,
        db: db as never,
      })
    ).resolves.toBe(false);
    expect(db.select).toHaveBeenCalledTimes(1);
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

  it('sets tenant context on the supplied db when listing cross-tenant grants', async () => {
    const { db, tx } = transactionalDbWithRows([{ ...activeLegalGrant, tenantId: 'tenant_home' }]);

    await expect(
      findActorCrossGrantContexts({
        accessTenantId: 'tenant_mk',
        actorId: 'local-legal-1',
        db: db as never,
        now: request.now,
      })
    ).resolves.toEqual([
      {
        caseId: 'claim-1',
        documentClasses: ['legal', 'evidence'],
        homeTenantId: 'tenant_home',
      },
    ]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(3);
    expect(tx.select).toHaveBeenCalledTimes(1);
  });
});
