import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimsFindFirst: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: { findFirst: hoisted.claimsFindFirst },
    },
    select: hoisted.dbSelect,
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  claims: { id: 'claims.id', tenantId: 'claims.tenantId' },
  claimDocuments: {
    id: 'claimDocuments.id',
    claimId: 'claimDocuments.claimId',
    tenantId: 'claimDocuments.tenantId',
    name: 'claimDocuments.name',
    fileSize: 'claimDocuments.fileSize',
    fileType: 'claimDocuments.fileType',
    createdAt: 'claimDocuments.createdAt',
  },
  claimStageHistory: {
    id: 'claimStageHistory.id',
    claimId: 'claimStageHistory.claimId',
    tenantId: 'claimStageHistory.tenantId',
    fromStatus: 'claimStageHistory.fromStatus',
    toStatus: 'claimStageHistory.toStatus',
    note: 'claimStageHistory.note',
    isPublic: 'claimStageHistory.isPublic',
    createdAt: 'claimStageHistory.createdAt',
    changedById: 'claimStageHistory.changedById',
  },
  user: { id: 'user.id', name: 'user.name', email: 'user.email' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((x: unknown) => ({ desc: x })),
  isNotNull: vi.fn((x: unknown) => ({ isNotNull: x })),
}));

import { getStaffClaimDetailsCore } from './_core';

function createSelectChain(result: unknown, resolveAt: 'where' | 'orderBy') {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  };

  if (resolveAt === 'where') {
    (chain.where as unknown as Mock).mockImplementationOnce(() => Promise.resolve(result));
  }

  return chain;
}

describe('getStaffClaimDetailsCore', () => {
  it('returns not_found when claim does not exist', async () => {
    hoisted.claimsFindFirst.mockResolvedValue(null);

    const result = await getStaffClaimDetailsCore({ claimId: 'c1', tenantId: 'tenant_mk' });

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns claim, documents (with fileName), and stage history', async () => {
    hoisted.claimsFindFirst.mockResolvedValue({
      id: 'c1',
      status: 'draft',
      user: { id: 'u1', tenantId: 'tenant_mk' },
    });

    const docsResult = [
      {
        id: 'd1',
        name: 'file.pdf',
        fileSize: 123,
        fileType: 'application/pdf',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      },
    ];

    const historyResult = [
      {
        id: 'h1',
        fromStatus: 'draft',
        toStatus: 'submitted',
        note: 'ok',
        isPublic: false,
        createdAt: new Date('2025-01-02T00:00:00Z'),
        changedByName: 'Staff',
        changedByEmail: 'staff@example.com',
      },
    ];

    hoisted.dbSelect
      .mockReturnValueOnce(createSelectChain(docsResult, 'where'))
      .mockReturnValueOnce(createSelectChain(historyResult, 'orderBy'));

    const result = await getStaffClaimDetailsCore({ claimId: 'c1', tenantId: 'tenant_mk' });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.claim.id).toBe('c1');
    expect(result.documents).toEqual([
      {
        id: 'd1',
        fileName: 'file.pdf',
        fileSize: 123,
        fileType: 'application/pdf',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      },
    ]);

    expect(result.stageHistory).toEqual(historyResult);
  });
});
