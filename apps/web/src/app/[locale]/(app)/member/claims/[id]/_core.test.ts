import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findClaimFirst: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: {
        findFirst: hoisted.findClaimFirst,
      },
    },
    select: hoisted.dbSelect,
  },
  claims: {
    id: 'claims.id',
  },
  claimDocuments: {
    id: 'claimDocuments.id',
    name: 'claimDocuments.name',
    fileSize: 'claimDocuments.fileSize',
    fileType: 'claimDocuments.fileType',
    createdAt: 'claimDocuments.createdAt',
    claimId: 'claimDocuments.claimId',
  },
  claimStageHistory: {
    toStatus: 'claimStageHistory.toStatus',
    createdAt: 'claimStageHistory.createdAt',
    claimId: 'claimStageHistory.claimId',
    isPublic: 'claimStageHistory.isPublic',
  },
  eq: vi.fn(),
}));

vi.mock('@interdomestik/database/constants', () => ({
  CLAIM_STATUSES: ['draft', 'submitted', 'resolved'],
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
}));

import { getMemberClaimDetailsCore, getMemberClaimRedirect } from './_core';

type SelectChain<T> = {
  from: () => SelectChain<T>;
  where: () => SelectChain<T>;
  orderBy?: () => Promise<T>;
};

function makeSelectChain<T>(final: T): SelectChain<T> {
  return {
    from: () => makeSelectChain(final),
    where: () => makeSelectChain(final),
    orderBy: async () => final,
  };
}

function makeSimpleSelectChain<T>(final: T): { from: () => { where: () => Promise<T> } } {
  return {
    from: () => ({
      where: async () => final,
    }),
  };
}

describe('getMemberClaimRedirect', () => {
  it('continues for user role', () => {
    expect(getMemberClaimRedirect({ role: 'user', claimId: 'c1' })).toEqual({
      kind: 'continue',
    });
  });

  it('redirects staff/admin/agent', () => {
    expect(getMemberClaimRedirect({ role: 'staff', claimId: 'c1' })).toEqual({
      kind: 'redirect',
      href: '/staff/claims/c1',
    });

    expect(getMemberClaimRedirect({ role: 'admin', claimId: 'c1' })).toEqual({
      kind: 'redirect',
      href: '/admin/claims/c1',
    });

    expect(getMemberClaimRedirect({ role: 'agent', claimId: 'c1' })).toEqual({
      kind: 'redirect',
      href: '/agent',
    });
  });

  it('returns not_found for unknown role', () => {
    expect(getMemberClaimRedirect({ role: 'weird', claimId: 'c1' })).toEqual({
      kind: 'not_found',
    });
  });
});

describe('getMemberClaimDetailsCore', () => {
  it('returns not_found when claim missing', async () => {
    hoisted.findClaimFirst.mockResolvedValueOnce(null);

    const result = await getMemberClaimDetailsCore({ claimId: 'c1', viewerUserId: 'u1' });
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns not_found when claim owned by someone else', async () => {
    hoisted.findClaimFirst.mockResolvedValueOnce({ id: 'c1', userId: 'other' });

    const result = await getMemberClaimDetailsCore({ claimId: 'c1', viewerUserId: 'u1' });
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns ok with documents and history', async () => {
    hoisted.findClaimFirst.mockResolvedValueOnce({ id: 'c1', userId: 'u1', status: 'submitted' });

    const docs = [
      {
        id: 'd1',
        name: 'doc.pdf',
        fileSize: 10,
        fileType: 'application/pdf',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ];

    const history = [
      {
        toStatus: 'resolved',
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
      },
    ];

    // 1st select() -> documents chain
    // 2nd select() -> history chain
    hoisted.dbSelect
      .mockReturnValueOnce(makeSimpleSelectChain(docs))
      .mockReturnValueOnce(makeSelectChain(history));

    const result = await getMemberClaimDetailsCore({ claimId: 'c1', viewerUserId: 'u1' });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.claim).toEqual(expect.objectContaining({ id: 'c1', userId: 'u1' }));
    expect(result.documents).toEqual(
      docs.map(d => ({
        id: d.id,
        name: d.name,
        fileSize: d.fileSize,
        fileType: d.fileType,
        createdAt: d.createdAt,
      }))
    );
    expect(result.publicStageHistory).toEqual([
      { toStatus: 'resolved', createdAt: new Date('2025-01-02T00:00:00.000Z') },
    ]);
  });
});
