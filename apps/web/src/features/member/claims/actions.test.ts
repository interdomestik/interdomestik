import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));

  return {
    authGetSession: vi.fn(),
    headers: vi.fn(),
    ensureTenantId: vi.fn(),
    resolveEvidenceBucketName: vi.fn(),
    findOwnedMemberUploadClaim: vi.fn(),
    findOwnedMemberInformationRequest: vi.fn(),
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
  DEFAULT_EVIDENCE_BUCKET: 'claim-evidence',
  resolveEvidenceBucketName: hoisted.resolveEvidenceBucketName,
}));

vi.mock('@/features/claims/upload/server/access', () => ({
  findOwnedMemberInformationRequest: hoisted.findOwnedMemberInformationRequest,
  findOwnedMemberUploadClaim: hoisted.findOwnedMemberUploadClaim,
}));

vi.mock('@interdomestik/database', () => ({
  createAdminClient: () => ({
    storage: {
      from: hoisted.storageFrom,
    },
  }),
  db: {
    insert: hoisted.insert,
    transaction: hoisted.transaction,
  },
  claimDocuments: 'claim_documents',
  claimDocumentAiExtractionConsents: 'claim_document_ai_extraction_consents',
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

import { confirmUpload, generateUploadUrl } from './actions';
import { createConfirmUploadParams } from './actions.test-fixtures';

describe('member claim upload actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.headers.mockResolvedValue(new Headers());
    hoisted.authGetSession.mockResolvedValue({
      user: { id: 'member-1', tenantId: 'tenant-1', role: 'member' },
    });
    hoisted.ensureTenantId.mockReturnValue('tenant-1');
    hoisted.resolveEvidenceBucketName.mockReturnValue('claim-evidence');
    hoisted.findOwnedMemberUploadClaim.mockResolvedValue({ id: 'claim-1' });
    hoisted.findOwnedMemberInformationRequest.mockResolvedValue({ id: 'request-1' });
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
    hoisted.queueClaimDocumentAiWorkflows.mockResolvedValue([]);

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
    hoisted.findOwnedMemberUploadClaim.mockResolvedValue(null);

    const result = await generateUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024);

    expect(result).toEqual({ success: false, error: 'Claim not found', status: 404 });
    expect(hoisted.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(hoisted.findOwnedMemberUploadClaim).toHaveBeenCalledWith({
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      userId: 'member-1',
    });
  });

  it('denies confirmUpload when claim is not owned by the member', async () => {
    hoisted.findOwnedMemberUploadClaim.mockResolvedValue(null);

    const result = await confirmUpload(createConfirmUploadParams());

    expect(result).toEqual({ success: false, error: 'Claim not found', status: 404 });
    expect(hoisted.insert).not.toHaveBeenCalled();
    expect(hoisted.findOwnedMemberUploadClaim).toHaveBeenCalledWith({
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      userId: 'member-1',
    });
  });

  it('preserves upload and skips AI dispatch when member consent is unchecked', async () => {
    const result = await confirmUpload(
      createConfirmUploadParams({ originalName: 'demand-letter.pdf', category: 'legal' })
    );

    expect(result).toEqual({ success: true });
    expect(hoisted.transaction).toHaveBeenCalledTimes(2);
    expect(hoisted.insert).toHaveBeenCalledWith('claim_documents');
    expect(hoisted.insert).not.toHaveBeenCalledWith('claim_document_ai_extraction_consents');
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
    expect(hoisted.emitClaimAiRunRequestedService).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/en/member/claims/claim-1');
  });

  it('records scoped ai document extraction consent only when checked', async () => {
    const result = await confirmUpload(
      createConfirmUploadParams({
        aiExtractionConsentGranted: true,
        aiExtractionConsentLocale: 'sq',
      })
    );

    expect(result).toEqual({ success: true });
    expect(hoisted.insert).toHaveBeenCalledWith('claim_document_ai_extraction_consents');
    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'member-1',
        claimId: 'claim-1',
        documentId: 'uuid-1',
        locale: 'sq',
        privacyVersion: 'privacy-2026-05',
        sourceSurface: 'member_claim_evidence_upload',
        status: 'accepted',
        subjectId: 'member-1',
        tenantId: 'tenant-1',
      })
    );
  });
});
