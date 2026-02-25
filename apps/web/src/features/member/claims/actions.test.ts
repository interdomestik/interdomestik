import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));

  return {
    authGetSession: vi.fn(),
    headers: vi.fn(),
    ensureTenantId: vi.fn(),
    resolveEvidenceBucketName: vi.fn(),
    findClaimFirst: vi.fn(),
    createSignedUploadUrl: vi.fn(),
    storageFrom: vi.fn(),
    insertValues: vi.fn(),
    insert: vi.fn(),
    revalidatePath: vi.fn(),
    and,
    eq,
  };
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.authGetSession,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headers,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.mock('@/lib/storage/evidence-bucket', () => ({
  resolveEvidenceBucketName: hoisted.resolveEvidenceBucketName,
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: {
        findFirst: hoisted.findClaimFirst,
      },
    },
    insert: hoisted.insert,
  },
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenant_id',
    userId: 'claims.user_id',
  },
  claimDocuments: 'claim_documents',
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: hoisted.storageFrom,
    },
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

import { confirmUpload, generateUploadUrl } from './actions';

describe('member claim upload actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.headers.mockResolvedValue(new Headers());
    hoisted.authGetSession.mockResolvedValue({
      user: { id: 'member-1', tenantId: 'tenant-1', role: 'member' },
    });
    hoisted.ensureTenantId.mockReturnValue('tenant-1');
    hoisted.resolveEvidenceBucketName.mockReturnValue('claim-evidence');
    hoisted.findClaimFirst.mockResolvedValue({ id: 'claim-1', userId: 'member-1' });
    hoisted.storageFrom.mockReturnValue({
      createSignedUploadUrl: hoisted.createSignedUploadUrl,
    });
    hoisted.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/upload', token: 'upload-token-1' },
      error: null,
    });
    hoisted.insert.mockReturnValue({
      values: hoisted.insertValues,
    });
    hoisted.insertValues.mockResolvedValue(undefined);

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  it('creates an upload URL for claims owned by the member', async () => {
    const result = await generateUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        bucket: 'claim-evidence',
      })
    );
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('retries transient signed upload URL failures before succeeding', async () => {
    hoisted.createSignedUploadUrl
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'fetch failed' },
      })
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://signed.example.com/upload-2', token: 'upload-token-2' },
        error: null,
      });

    const result = await generateUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        bucket: 'claim-evidence',
      })
    );
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient signed upload URL errors', async () => {
    hoisted.createSignedUploadUrl.mockResolvedValue({
      data: null,
      error: { message: 'mime type text/plain is not supported' },
    });

    const result = await generateUploadUrl('claim-1', 'evidence.txt', 'text/plain', 1024);

    expect(result).toEqual({
      success: false,
      error: 'Failed to generate upload URL: mime type text/plain is not supported',
      status: 500,
    });
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('denies signed URL issuance for same-tenant claims owned by another member', async () => {
    hoisted.findClaimFirst.mockResolvedValue(null);

    const result = await generateUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024);

    expect(result).toEqual({ success: false, error: 'Claim not found', status: 404 });
    expect(hoisted.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(hoisted.findClaimFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        op: 'and',
        args: expect.arrayContaining([
          expect.objectContaining({ op: 'eq', left: 'claims.user_id', right: 'member-1' }),
        ]),
      }),
    });
  });

  it('denies confirmUpload when claim is not owned by the member', async () => {
    hoisted.findClaimFirst.mockResolvedValue(null);

    const result = await confirmUpload(
      'claim-1',
      'pii/tenants/tenant-1/claims/claim-1/uuid-1.pdf',
      'evidence.pdf',
      'application/pdf',
      1024,
      'uuid-1',
      'claim-evidence'
    );

    expect(result).toEqual({ success: false, error: 'Claim not found', status: 404 });
    expect(hoisted.insert).not.toHaveBeenCalled();
    expect(hoisted.findClaimFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        op: 'and',
        args: expect.arrayContaining([
          expect.objectContaining({ op: 'eq', left: 'claims.user_id', right: 'member-1' }),
        ]),
      }),
    });
  });
});
