import { getUploadActionMocks } from './actions.test-support';
import { confirmUpload, generateUploadUrl } from './actions';
import { describe, expect, it } from 'vitest';
import { createConfirmUploadParams } from './actions.test-fixtures';

const hoisted = getUploadActionMocks();

describe('member claim upload actions', () => {
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
      role: 'member',
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
      role: 'member',
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
    expect(hoisted.transaction).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'member' },
      expect.any(Function)
    );
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
