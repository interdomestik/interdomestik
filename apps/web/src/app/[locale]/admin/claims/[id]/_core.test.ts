import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimsFindFirst: vi.fn(),
  dbSelect: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  createSignedUrl: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: { findFirst: hoisted.claimsFindFirst },
    },
    select: hoisted.dbSelect,
  },
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: hoisted.createSignedUrl.mockResolvedValue({
          data: { signedUrl: 'https://signed.example.com/doc' },
        }),
      })),
    },
  })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: hoisted.and,
  claims: { id: 'claims.id', tenantId: 'claims.tenantId' },
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
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/doc' },
    });
  });

  it('returns not_found when tenant context is missing', async () => {
    const result = await getAdminClaimDetailsCore({ claimId: 'c1' });

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns not_found when claim does not exist', async () => {
    hoisted.claimsFindFirst.mockResolvedValue(null);

    const result = await getAdminClaimDetailsCore({ claimId: 'c1', tenantId: 'tenant-a' });

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('enforces tenant scope for detail query boundary', async () => {
    hoisted.claimsFindFirst.mockResolvedValue(null);

    const result = await getAdminClaimDetailsCore({ claimId: 'c1', tenantId: 'tenant-a' });

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.and).toHaveBeenCalled();
    expect(hoisted.and).toHaveBeenCalledWith(
      { eq: ['claims.id', 'c1'] },
      { eq: ['claims.tenantId', 'tenant-a'] }
    );
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

    const result = await getAdminClaimDetailsCore({ claimId: 'c1', tenantId: 'tenant-a' });

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

  it('maps nullable/unknown optional document fields without crashing', async () => {
    hoisted.claimsFindFirst.mockResolvedValue({
      id: 'c1',
      title: 'T',
      user: { name: 'User', email: 'u@example.com', image: null },
    });

    const docsResult = [
      {
        id: 'd1',
        name: 'file.pdf',
        fileSize: null,
        fileType: null,
        createdAt: null,
        filePath: null,
        bucket: null,
      },
    ];

    hoisted.dbSelect.mockReturnValueOnce(createSelectChain(docsResult));

    await expect(
      getAdminClaimDetailsCore({ claimId: 'c1', tenantId: 'tenant-a' })
    ).resolves.toMatchObject({
      kind: 'ok',
      data: {
        id: 'c1',
        docs: [
          {
            id: 'd1',
            name: 'file.pdf',
            fileSize: null,
            fileType: null,
            createdAt: null,
            url: '',
          },
        ],
      },
    });
  });
});
