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
    listStorageObjects: vi.fn(),
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
    userId: 'claims.user_id',
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

import { createClaimUploadIntentToken } from '@/features/claims/upload/server/shared-upload';
import { confirmUpload, generateUploadUrl } from './actions';

function createUploadIntent(
  overrides: Partial<{
    actorId: string;
    bucket: string;
    claimId: string;
    fileId: string;
    fileSize: number;
    mimeType: string;
    storagePath: string;
    tenantId: string;
  }> = {}
) {
  return createClaimUploadIntentToken({
    actorId: 'member-1',
    bucket: 'claim-evidence',
    claimId: 'claim-1',
    fileId: 'uuid-1',
    fileSize: 1024,
    mimeType: 'application/pdf',
    storagePath: 'pii/tenants/tenant-1/claims/claim-1/uuid-1.pdf',
    tenantId: 'tenant-1',
    ...overrides,
  });
}

function createConfirmUploadParams(overrides: Partial<Parameters<typeof confirmUpload>[0]> = {}) {
  return {
    claimId: 'claim-1',
    storagePath: 'pii/tenants/tenant-1/claims/claim-1/uuid-1.pdf',
    originalName: 'evidence.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    fileId: 'uuid-1',
    uploadIntentToken: createUploadIntent(),
    uploadedBucket: 'claim-evidence',
    ...overrides,
  };
}

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
      list: hoisted.listStorageObjects,
    });
    hoisted.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/upload', token: 'upload-token-1' },
      error: null,
    });
    hoisted.listStorageObjects.mockResolvedValue({
      data: [
        {
          name: 'uuid-1.pdf',
          metadata: { size: 1024, mimetype: 'application/pdf' },
        },
      ],
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
    vi.stubEnv('BETTER_AUTH_SECRET', 'upload-intent-test-secret-32-chars-minimum');
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

  it('rejects invalid signed upload file sizes before storage URL creation', async () => {
    const result = await generateUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 0);

    expect(result).toEqual({ success: false, error: 'Invalid file size', status: 400 });
    expect(hoisted.createSignedUploadUrl).not.toHaveBeenCalled();
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

  it('fails after exhausting transient signed upload retries', async () => {
    hoisted.createSignedUploadUrl.mockResolvedValue({
      data: null,
      error: { message: 'fetch failed' },
    });

    const result = await generateUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024);

    expect(result).toEqual({
      success: false,
      error: 'Failed to generate upload URL: fetch failed',
      status: 500,
    });
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalledTimes(3);
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

    const result = await confirmUpload(createConfirmUploadParams());

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

  it('rejects forged upload metadata before persisting the document', async () => {
    const result = await confirmUpload(
      createConfirmUploadParams({
        storagePath: 'pii/tenants/tenant-1/claims/claim-1/uuid-2.pdf',
        fileId: 'uuid-2',
      })
    );

    expect(result).toEqual({
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    });
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it('rejects upload intent tokens with extra segments before storage verification', async () => {
    const result = await confirmUpload(
      createConfirmUploadParams({ uploadIntentToken: `${createUploadIntent()}.extra` })
    );

    expect(result).toEqual({
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    });
    expect(hoisted.listStorageObjects).not.toHaveBeenCalled();
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it('rejects confirmation when the uploaded object metadata does not match the intent', async () => {
    hoisted.listStorageObjects.mockResolvedValueOnce({
      data: [
        {
          name: 'uuid-1.pdf',
          metadata: { size: 2048, mimetype: 'application/pdf' },
        },
      ],
      error: null,
    });

    const result = await confirmUpload(createConfirmUploadParams());

    expect(result).toEqual({
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    });
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it('queues a legal-document ai run after confirming the upload metadata', async () => {
    const result = await confirmUpload(
      createConfirmUploadParams({ originalName: 'demand-letter.pdf', category: 'legal' })
    );

    expect(result).toEqual({ success: true });
    expect(hoisted.transaction).toHaveBeenCalledTimes(2);
    expect(hoisted.insert).toHaveBeenCalledWith('claim_documents');
    expect(hoisted.queueClaimDocumentAiWorkflows).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        userId: 'member-1',
        files: [
          expect.objectContaining({
            documentId: 'uuid-1',
            category: 'legal',
            name: 'demand-letter.pdf',
          }),
        ],
      })
    );
    expect(hoisted.emitClaimAiRunRequestedService).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        workflow: 'legal_doc_extract',
      })
    );
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/sq/member/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/en/member/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/sr/member/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/member/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/sq/member/documents');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/en/member/documents');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/sr/member/documents');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/mk/member/documents');
  });

  it('keeps the upload persisted when ai queueing fails after metadata is saved', async () => {
    hoisted.queueClaimDocumentAiWorkflows.mockRejectedValueOnce(new Error('ai queue unavailable'));

    const result = await confirmUpload(createConfirmUploadParams({ category: 'evidence' }));

    expect(result).toEqual({ success: true });
    expect(hoisted.insert).toHaveBeenCalledWith('claim_documents');
    expect(hoisted.queueClaimDocumentAiWorkflows).toHaveBeenCalledOnce();
    expect(hoisted.emitClaimAiRunRequestedService).not.toHaveBeenCalled();
    expect(hoisted.markClaimAiRunDispatchFailedService).not.toHaveBeenCalled();
  });
});
