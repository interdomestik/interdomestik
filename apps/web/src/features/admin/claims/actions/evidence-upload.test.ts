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
    createSignedUploadUrl: vi.fn(),
    storageFrom: vi.fn(),
    insertValues: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
    revalidatePath: vi.fn(),
    queueClaimDocumentAiWorkflows: vi.fn(),
    emitClaimAiRunRequestedService: vi.fn(),
    markClaimAiRunDispatchFailedService: vi.fn(),
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

vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveTenantFromHost: hoisted.resolveTenantFromHost,
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
    transaction: hoisted.transaction,
  },
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenant_id',
  },
  claimDocuments: 'claim_documents',
}));

vi.mock('@interdomestik/domain-claims/claims/ai-workflows', () => ({
  queueClaimDocumentAiWorkflows: hoisted.queueClaimDocumentAiWorkflows,
}));

vi.mock('@/lib/ai/claim-workflows', () => ({
  emitClaimAiRunRequestedService: hoisted.emitClaimAiRunRequestedService,
  markClaimAiRunDispatchFailedService: hoisted.markClaimAiRunDispatchFailedService,
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
    hoisted.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        insert: hoisted.insert,
      })
    );
    hoisted.insertValues.mockResolvedValue(undefined);
    hoisted.queueClaimDocumentAiWorkflows.mockResolvedValue([
      {
        runId: 'run-1',
        workflow: 'legal_doc_extract',
        claimId: 'claim-1',
        documentId: 'uuid-1',
      },
    ]);

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  it('creates an upload URL for authorized admin claim access', async () => {
    const result = await generateAdminUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        bucket: 'claim-evidence',
      })
    );
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('denies upload URL issuance for member sessions on the admin flow', async () => {
    hoisted.authGetSession.mockResolvedValueOnce({
      user: { id: 'member-1', tenantId: 'tenant-1', role: 'member' },
    });

    const result = await generateAdminUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024);

    expect(result).toEqual({ success: false, error: 'Unauthorized', status: 401 });
    expect(hoisted.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('persists uploaded admin evidence and revalidates cross-surface claim views', async () => {
    const result = await confirmAdminUpload({
      claimId: 'claim-1',
      storagePath: 'pii/tenants/tenant-1/claims/claim-1/uuid-1.pdf',
      originalName: 'evidence.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      fileId: 'uuid-1',
      uploadedBucket: 'claim-evidence',
      category: 'evidence',
    });

    expect(result).toEqual({ success: true });
    expect(hoisted.insert).toHaveBeenCalledWith('claim_documents');
    expect(hoisted.queueClaimDocumentAiWorkflows).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        userId: 'admin-1',
      })
    );
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/admin/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/staff/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/member/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/member/documents');
  });
});
