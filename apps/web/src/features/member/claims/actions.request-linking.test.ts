import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  headers: vi.fn(),
  ensureTenantId: vi.fn(),
  resolveEvidenceBucketName: vi.fn(),
  findOwnedMemberUploadClaim: vi.fn(),
  findOwnedMemberInformationRequest: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  listStorageObjects: vi.fn(),
  storageFrom: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: hoisted.authGetSession } },
}));

vi.mock('next/headers', () => ({ headers: hoisted.headers }));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: hoisted.ensureTenantId }));
vi.mock('@/lib/storage/evidence-bucket', () => ({
  DEFAULT_EVIDENCE_BUCKET: 'claim-evidence',
  resolveEvidenceBucketName: hoisted.resolveEvidenceBucketName,
}));
vi.mock('@/features/claims/upload/server/access', () => ({
  findOwnedMemberInformationRequest: hoisted.findOwnedMemberInformationRequest,
  findOwnedMemberUploadClaim: hoisted.findOwnedMemberUploadClaim,
}));
vi.mock('@interdomestik/database', () => ({
  createAdminClient: () => ({ storage: { from: hoisted.storageFrom } }),
  db: { insert: hoisted.insert, transaction: hoisted.transaction },
  claimDocuments: 'claim_documents',
  claimDocumentAiExtractionConsents: 'claim_document_ai_extraction_consents',
}));
vi.mock('@interdomestik/domain-claims/claims/ai-workflows', () => ({
  queueClaimDocumentAiWorkflows: vi.fn(),
}));
vi.mock('@/lib/ai/claim-workflows', () => ({
  emitClaimAiRunRequestedService: vi.fn(),
  markClaimAiRunDispatchFailedService: vi.fn(),
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: hoisted.storageFrom } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: hoisted.revalidatePath }));

import { confirmUpload } from './actions';
import { createConfirmUploadParams, createUploadIntent } from './actions.test-fixtures';

describe('member request-linked claim upload actions', () => {
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
    hoisted.listStorageObjects.mockResolvedValue({
      data: [{ name: 'uuid-1.pdf', metadata: { size: 1024, mimetype: 'application/pdf' } }],
      error: null,
    });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.com');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('BETTER_AUTH_SECRET', 'upload-intent-test-secret-32-chars-minimum');
  });

  it('rejects confirmation when the request association differs from the signed intent', async () => {
    const result = await confirmUpload(
      createConfirmUploadParams({
        informationRequestId: '12345678-1234-4234-8234-123456789012',
      })
    );

    expect(result).toEqual({
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    });
    expect(hoisted.insert).not.toHaveBeenCalled();
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
});
