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
  claims: { id: 'claims.id' },
  claimDocuments: {
    id: 'claimDocuments.id',
    claimId: 'claimDocuments.claimId',
    name: 'claimDocuments.name',
    fileSize: 'claimDocuments.fileSize',
    fileType: 'claimDocuments.fileType',
    createdAt: 'claimDocuments.createdAt',
    filePath: 'claimDocuments.filePath',
    bucket: 'claimDocuments.bucket',
  },
}));

import { getAdminClaimDetailsCore } from './_core';

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

describe('getAdminClaimDetailsCore', () => {
  it('returns not_found when claim does not exist', async () => {
    hoisted.claimsFindFirst.mockResolvedValue(null);

    const result = await getAdminClaimDetailsCore({ claimId: 'c1' });

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns claim and docs when found', async () => {
    hoisted.claimsFindFirst.mockResolvedValue({
      id: 'c1',
      title: 'T',
      user: { name: 'User', email: 'u@example.com', image: null },
    });

    const docsResult = [
      {
        id: 'd1',
        name: 'file.pdf',
        fileSize: 123,
        fileType: 'application/pdf',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        filePath: 'claims/c1/file.pdf',
        bucket: 'claim-documents',
      },
    ];

    hoisted.dbSelect.mockReturnValueOnce(createSelectChain(docsResult));

    const result = await getAdminClaimDetailsCore({ claimId: 'c1' });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.data.id).toBe('c1');
    expect(result.data.docs).toEqual([
      {
        id: 'd1',
        name: 'file.pdf',
        fileSize: 123,
        fileType: 'application/pdf',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        url: expect.any(String),
      },
    ]);
  });
});
