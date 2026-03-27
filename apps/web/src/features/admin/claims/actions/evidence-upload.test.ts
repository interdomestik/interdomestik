import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));

  return {
    authGetSession: vi.fn(),
    headers: vi.fn(),
    ensureTenantId: vi.fn(),
    resolveTenantFromHost: vi.fn(),
    resolveEvidenceBucketName: vi.fn(),
    findClaimFirst: vi.fn(),
    revalidatePath: vi.fn(),
    insertValues: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
    and,
    eq,
  };
});

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: hoisted.authGetSession } },
}));
vi.mock('next/headers', () => ({ headers: hoisted.headers }));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: hoisted.ensureTenantId }));
vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveTenantFromHost: hoisted.resolveTenantFromHost,
}));
vi.mock('@/lib/storage/evidence-bucket', () => ({
  resolveEvidenceBucketName: hoisted.resolveEvidenceBucketName,
}));
vi.mock('@interdomestik/database', () => ({
  db: {
    query: { claims: { findFirst: hoisted.findClaimFirst } },
    insert: hoisted.insert,
    transaction: hoisted.transaction,
  },
  claims: { id: 'claims.id', tenantId: 'claims.tenant_id' },
}));
vi.mock('drizzle-orm', () => ({ and: hoisted.and, eq: hoisted.eq }));
vi.mock('next/cache', () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock('@/features/claims/upload/server/shared-upload', () => ({
  createSignedUploadUrl: vi.fn().mockResolvedValue({
    success: true,
    bucket: 'claim-evidence',
    path: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
    token: 'upload-token',
    id: 'file-id',
  }),
  persistClaimDocumentAndQueueWorkflows: vi.fn().mockResolvedValue(undefined),
  revalidatePathForAllLocales: (path: string) => hoisted.revalidatePath(`/mk${path}`),
}));

import { confirmAdminUpload, generateAdminUploadUrl } from './evidence-upload';

describe('admin claim evidence upload actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.headers.mockResolvedValue(
      new Headers([
        ['host', 'mk.127.0.0.1.nip.io:3000'],
        ['x-forwarded-host', 'mk.127.0.0.1.nip.io:3000'],
      ])
    );
    hoisted.authGetSession.mockResolvedValue({
      user: { id: 'admin-1', tenantId: 'tenant-1', role: 'admin' },
    });
    hoisted.ensureTenantId.mockReturnValue('tenant-1');
    hoisted.resolveTenantFromHost.mockReturnValue('tenant-1');
    hoisted.resolveEvidenceBucketName.mockReturnValue('claim-evidence');
    hoisted.findClaimFirst.mockResolvedValue({ id: 'claim-1' });
    hoisted.insert.mockReturnValue({ values: hoisted.insertValues });
    hoisted.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ insert: hoisted.insert })
    );
  });

  it('rejects upload URL issuance when the admin host tenant drifts', async () => {
    hoisted.resolveTenantFromHost.mockReturnValueOnce('tenant-2');

    await expect(
      generateAdminUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024)
    ).resolves.toEqual({ success: false, error: 'Unauthorized', status: 401 });
  });

  it('rejects upload URL issuance for non-admin roles on the admin flow', async () => {
    hoisted.authGetSession.mockResolvedValueOnce({
      user: { id: 'member-1', tenantId: 'tenant-1', role: 'member' },
    });

    await expect(
      generateAdminUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024)
    ).resolves.toEqual({ success: false, error: 'Unauthorized', status: 401 });
  });

  it('revalidates admin and staff claim surfaces after confirming upload metadata', async () => {
    await expect(
      confirmAdminUpload({
        claimId: 'claim-1',
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
        originalName: 'evidence.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        fileId: 'file-id',
        uploadedBucket: 'claim-evidence',
      })
    ).resolves.toEqual({ success: true });

    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/admin/claims');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/admin/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/staff/claims/claim-1');
  });
});
