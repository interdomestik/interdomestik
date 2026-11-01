import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn(),
  createTenantSignedUploadUrl: vi.fn(),
  eq: vi.fn(),
  findClaimFirst: vi.fn(),
  matchesAccessTenant: vi.fn((_table: unknown, tenantId: string) => `access:${tenantId}`),
  withTenantContext: vi.fn(
    async (
      _context: unknown,
      callback: (tx: { query: { claims: { findFirst: () => unknown } } }) => unknown
    ) =>
      callback({
        query: { claims: { findFirst: (...args: unknown[]) => hoisted.findClaimFirst(...args) } },
      })
  ),
}));

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  claims: { id: 'id', tenantId: 'tenant_id' },
  db: { query: { claims: { findFirst: hoisted.findClaimFirst } } },
  eq: hoisted.eq,
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@/lib/db/access-tenant-predicate', () => ({
  matchesAccessTenant: hoisted.matchesAccessTenant,
}));

vi.mock('@/lib/storage/service-role', () => ({
  createTenantSignedUploadUrl: hoisted.createTenantSignedUploadUrl,
}));

vi.mock('nanoid', () => ({ nanoid: () => 'evidence-123' }));

import { createSignedUploadCore } from './_core';

describe('createSignedUploadCore access tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-intent-secret-value-123456');
    hoisted.findClaimFirst.mockResolvedValue({
      id: 'claim-1',
      tenantId: 'tenant_home',
      userId: 'member-1',
    });
    hoisted.createTenantSignedUploadUrl.mockResolvedValue({
      data: { token: 'tok', signedUrl: 'https://signed.example/upload' },
      error: null,
    });
  });

  it('uses access tenant for claim lookup and claim home tenant for storage', async () => {
    const result = await createSignedUploadCore({
      bucket: 'claim-evidence',
      input: {
        claimId: 'claim-1',
        fileName: 'legal.pdf',
        fileSize: 10,
        fileType: 'application/pdf',
      },
      session: {
        user: {
          id: 'member-1',
          role: 'member',
          tenantId: 'tenant_legal_compat',
          accessTenantId: 'tenant_access',
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_access', role: 'member' },
      expect.any(Function)
    );
    expect(hoisted.matchesAccessTenant).toHaveBeenCalledWith(expect.anything(), 'tenant_access');
    expect(hoisted.matchesAccessTenant).not.toHaveBeenCalledWith(
      expect.anything(),
      'tenant_legal_compat'
    );
    if (result.ok) {
      expect(result.body.upload.path).toBe(
        'pii/tenants/tenant_home/claims/claim-1/evidence-123.pdf'
      );
    }
    expect(hoisted.findClaimFirst).toHaveBeenCalledWith(
      expect.objectContaining({ columns: expect.objectContaining({ tenantId: true }) })
    );
    expect(hoisted.createTenantSignedUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_home' })
    );
  });
});
