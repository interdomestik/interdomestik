import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));
  const inArray = vi.fn((left: unknown, right: unknown[]) => ({ op: 'inArray', left, right }));
  const desc = vi.fn((value: unknown) => ({ op: 'desc', value }));

  return {
    and,
    createSignedUrl: vi.fn(),
    desc,
    eq,
    findDocumentExtractionsMany: vi.fn(),
    findPoliciesMany: vi.fn(),
    inArray,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: hoisted.createSignedUrl,
      }),
    },
  }),
  db: {
    query: {
      documentExtractions: {
        findMany: hoisted.findDocumentExtractionsMany,
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
  policies: {
    createdAt: 'policies.created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  desc: hoisted.desc,
}));

import { getPoliciesWithSignedUrlsCore } from './_core';

describe('getPoliciesWithSignedUrlsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findPoliciesMany.mockResolvedValue([]);
    hoisted.findDocumentExtractionsMany.mockResolvedValue([]);
    hoisted.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/policy.pdf' },
      error: null,
    });
  });

  it('prefers the latest extraction over legacy analysisJson', async () => {
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

    const result = await getPoliciesWithSignedUrlsCore({
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result).toEqual([
      expect.objectContaining({
        fileHref: 'https://signed.example/policy.pdf',
        resolvedAnalysis: {
          summary: 'fresh extraction',
          coverageAmount: '900',
        },
      }),
    ]);
    expect(hoisted.createSignedUrl).toHaveBeenCalledWith(
      'pii/tenants/tenant-1/policies/user-1/policy.pdf',
      300
    );
  });

  it('falls back to legacy analysisJson when no extraction exists', async () => {
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

    const result = await getPoliciesWithSignedUrlsCore({
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result).toEqual([
      expect.objectContaining({
        fileHref: 'https://cdn.example/policy.pdf',
        resolvedAnalysis: {
          summary: 'legacy summary',
          coverageAmount: '500',
        },
      }),
    ]);
    expect(hoisted.createSignedUrl).not.toHaveBeenCalled();
  });
});
