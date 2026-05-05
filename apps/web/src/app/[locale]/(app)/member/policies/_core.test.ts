import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));
  const inArray = vi.fn((left: unknown, right: unknown[]) => ({ op: 'inArray', left, right }));
  const isNull = vi.fn((value: unknown) => ({ op: 'isNull', value }));
  const desc = vi.fn((value: unknown) => ({ op: 'desc', value }));

  return {
    and,
    desc,
    eq,
    findDocumentExtractionsMany: vi.fn(),
    findDocumentsMany: vi.fn(),
    findPoliciesMany: vi.fn(),
    inArray,
    isNull,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  db: {
    query: {
      documentExtractions: {
        findMany: hoisted.findDocumentExtractionsMany,
      },
      documents: {
        findMany: hoisted.findDocumentsMany,
      },
      policies: {
        findMany: hoisted.findPoliciesMany,
      },
    },
  },
  eq: hoisted.eq,
  inArray: hoisted.inArray,
}));

vi.mock('@interdomestik/database/schema', () => ({
  documentExtractions: {
    createdAt: 'document_extractions.created_at',
  },
  documents: {
    uploadedAt: 'documents.uploaded_at',
  },
  policies: {
    createdAt: 'policies.created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  desc: hoisted.desc,
}));

import { getPoliciesWithDocumentLinksCore } from './_core';

describe('getPoliciesWithDocumentLinksCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findPoliciesMany.mockResolvedValue([]);
    hoisted.findDocumentExtractionsMany.mockResolvedValue([]);
    hoisted.findDocumentsMany.mockResolvedValue([]);
  });

  it('uses the latest tenant-scoped policy document link and latest extraction', async () => {
    hoisted.findPoliciesMany.mockResolvedValue([
      {
        id: 'policy-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: 'Legacy Carrier',
        policyNumber: 'POL-123',
        analysisJson: { summary: 'legacy summary', coverageAmount: '500' },
        fileUrl: 'pii/tenants/tenant-1/policies/user-1/policy.pdf',
        createdAt: new Date('2026-03-08T10:00:00.000Z'),
      },
    ]);
    hoisted.findDocumentExtractionsMany.mockResolvedValue([
      {
        entityId: 'policy-1',
        extractedJson: { summary: 'fresh extraction', coverageAmount: '900' },
        createdAt: new Date('2026-03-08T10:05:00.000Z'),
      },
      {
        entityId: 'policy-1',
        extractedJson: { summary: 'older extraction', coverageAmount: '200' },
        createdAt: new Date('2026-03-08T10:01:00.000Z'),
      },
    ]);
    hoisted.findDocumentsMany.mockResolvedValue([
      { id: 'doc-new', entityId: 'policy-1' },
      { id: 'doc-old', entityId: 'policy-1' },
    ]);

    const result = await getPoliciesWithDocumentLinksCore({
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result).toEqual([
      expect.objectContaining({
        documentDownloadHref: '/api/documents/doc-new/download?disposition=inline',
        resolvedAnalysis: {
          summary: 'fresh extraction',
          coverageAmount: '900',
        },
      }),
    ]);
    expect(hoisted.findDocumentsMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [expect.objectContaining({ op: 'desc', value: 'documents.uploaded_at' })],
      })
    );
  });

  it('keeps legacy raw policy URLs disabled when no document row exists', async () => {
    hoisted.findPoliciesMany.mockResolvedValue([
      {
        id: 'policy-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: 'Legacy Carrier',
        policyNumber: 'POL-123',
        analysisJson: { summary: 'legacy summary', coverageAmount: '500' },
        fileUrl: 'https://cdn.example/policy.pdf',
        createdAt: new Date('2026-03-08T10:00:00.000Z'),
      },
    ]);

    const result = await getPoliciesWithDocumentLinksCore({
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result).toEqual([
      expect.objectContaining({
        documentDownloadHref: '',
        resolvedAnalysis: {
          summary: 'legacy summary',
          coverageAmount: '500',
        },
      }),
    ]);
  });

  it('does not surface a cross-tenant document row for an otherwise matching policy id', async () => {
    hoisted.findPoliciesMany.mockResolvedValue([
      {
        id: 'policy-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: 'Legacy Carrier',
        policyNumber: 'POL-123',
        analysisJson: {},
        fileUrl: 'pii/tenants/tenant-1/policies/user-1/policy.pdf',
        createdAt: new Date('2026-03-08T10:00:00.000Z'),
      },
    ]);
    hoisted.findDocumentsMany.mockImplementationOnce(async options => {
      const filter = options.where(
        {
          tenantId: 'documents.tenant_id',
          entityType: 'documents.entity_type',
          entityId: 'documents.entity_id',
          deletedAt: 'documents.deleted_at',
        },
        {
          and: hoisted.and,
          eq: hoisted.eq,
          inArray: hoisted.inArray,
          isNull: hoisted.isNull,
        }
      );

      expect(filter).toEqual(
        expect.objectContaining({
          op: 'and',
          args: expect.arrayContaining([
            { op: 'eq', left: 'documents.tenant_id', right: 'tenant-1' },
          ]),
        })
      );

      return [];
    });

    const result = await getPoliciesWithDocumentLinksCore({
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result).toEqual([expect.objectContaining({ documentDownloadHref: '' })]);
  });
});
