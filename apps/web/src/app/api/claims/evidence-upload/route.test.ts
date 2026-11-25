import {
  createEvidenceUploadRequest,
  evidenceUploadMocks as hoisted,
  resetEvidenceUploadMocks,
} from './route.test-support';
import mkEvidence from '@/messages/mk/evidence.json';
import { EVIDENCE_FORMAT_LABEL } from '@/features/claims/upload/evidence-file-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
const ACCESS_MODULE = '@/features/claims/upload/server/access';
type AccessModule = typeof import('@/features/claims/upload/server/access');

describe('POST /api/claims/evidence-upload', () => {
  beforeEach(resetEvidenceUploadMocks);

  it('denies staff uploads outside branch or assignment scope before storage upload', async () => {
    hoisted.findAccessibleAdminUploadClaim.mockResolvedValueOnce(null);

    const response = await POST(createEvidenceUploadRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Claim not found' });
    expect(hoisted.upload).not.toHaveBeenCalled();
    expect(hoisted.confirmAdminUpload).not.toHaveBeenCalled();
  });

  it('denies member uploads for claims outside member ownership before storage upload', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { id: 'member-2', role: 'member', tenantId: 'tenant-1' },
    });
    hoisted.findOwnedMemberUploadClaim.mockResolvedValueOnce(null);

    const response = await POST(createEvidenceUploadRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Claim not found' });
    expect(hoisted.findOwnedMemberUploadClaim).toHaveBeenCalledWith({
      claimId: 'claim-1',
      authority: expect.any(Object),
      role: 'member',
      userId: 'member-2',
    });
    expect(hoisted.upload).not.toHaveBeenCalled();
    expect(hoisted.confirmUpload).not.toHaveBeenCalled();
  });

  it.each(['auditor', 'global_support', 'branch_manager'])(
    'refuses a %s owner via the real guard',
    async role => {
      const { findOwnedMemberUploadClaim } = await vi.importActual<AccessModule>(ACCESS_MODULE);
      hoisted.findOwnedMemberUploadClaim.mockImplementationOnce(findOwnedMemberUploadClaim);
      const user = { id: 'member-1', role, tenantId: 'tenant-1' };
      hoisted.getSession.mockResolvedValueOnce({ user });
      expect((await POST(createEvidenceUploadRequest())).status).toBe(404);
      expect(hoisted.upload).not.toHaveBeenCalled();
    }
  );
  it('captures orphan-upload telemetry when metadata confirmation fails after storage upload', async () => {
    hoisted.confirmAdminUpload.mockResolvedValueOnce({
      success: false,
      error: 'Failed to save document metadata',
      status: 500,
    });

    const response = await POST(createEvidenceUploadRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to save document metadata' });
    expect(hoisted.captureMessage).toHaveBeenCalledWith(
      'claim.evidence_upload.confirm_failed_after_storage_upload',
      expect.objectContaining({ level: 'warning' })
    );
  });

  it('rejects request-linked uploads from an admin surface before storage upload', async () => {
    const response = await POST(
      createEvidenceUploadRequest(undefined, '12345678-1234-4234-8234-123456789012')
    );

    expect(response.status).toBe(404);
    expect(hoisted.upload).not.toHaveBeenCalled();
    expect(hoisted.confirmAdminUpload).not.toHaveBeenCalled();
  });

  it('rejects an unowned member information request before storage upload', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
    });
    hoisted.findOwnedMemberInformationRequest.mockResolvedValueOnce(null);

    const response = await POST(
      createEvidenceUploadRequest(undefined, '12345678-1234-4234-8234-123456789012')
    );

    expect(response.status).toBe(404);
    expect(hoisted.upload).not.toHaveBeenCalled();
    expect(hoisted.confirmUpload).not.toHaveBeenCalled();
  });

  it('binds a member direct upload intent and confirmation to its information request', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
    });
    const informationRequestId = '12345678-1234-4234-8234-123456789012';

    const response = await POST(createEvidenceUploadRequest(undefined, informationRequestId));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, fileId: expect.any(String) });
    expect(hoisted.createClaimUploadIntentToken).toHaveBeenCalledWith(
      expect.objectContaining({ informationRequestId })
    );
    expect(hoisted.confirmUpload).toHaveBeenCalledWith(
      expect.objectContaining({ informationRequestId })
    );
  });

  it('preserves a request-link conflict as 409 after storage upload', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
    });
    hoisted.confirmUpload.mockResolvedValueOnce({
      success: false,
      error: 'Information request upload conflict',
      status: 409,
    });

    const response = await POST(
      createEvidenceUploadRequest(undefined, '12345678-1234-4234-8234-123456789012')
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Information request upload conflict',
    });
    expect(hoisted.captureMessage).toHaveBeenCalled();
  });

  it('passes a server-issued upload intent token into metadata confirmation', async () => {
    const response = await POST(createEvidenceUploadRequest());

    expect(response.status).toBe(200);
    expect(hoisted.createClaimUploadIntentToken).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'staff-1',
        bucket: 'claim-evidence',
        claimId: 'claim-1',
        fileSize: 4,
        mimeType: 'application/pdf',
        storageContentType: 'application/pdf',
        tenantId: 'tenant-1',
      })
    );
    expect(hoisted.confirmAdminUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        storageContentType: 'application/pdf',
        uploadIntentToken: 'upload-intent-token',
      })
    );
  });

  it('rejects zero-byte files before storage upload', async () => {
    const response = await POST(
      createEvidenceUploadRequest(new File([], 'empty.pdf', { type: 'application/pdf' }))
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: mkEvidence.evidence.fileUpload.empty });
    expect(hoisted.createClaimUploadIntentToken).not.toHaveBeenCalled();
    expect(hoisted.upload).not.toHaveBeenCalled();
  });

  it('rejects slash injection in direct-upload filenames before storage upload', async () => {
    const response = await POST(
      createEvidenceUploadRequest(
        new File(['test'], 'evidence.pdf/..', { type: 'application/pdf' })
      )
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: mkEvidence.evidence.fileUpload.unsupported.replace('{formats}', EVIDENCE_FORMAT_LABEL),
    });
    expect(hoisted.upload).not.toHaveBeenCalled();
  });

  it('fails upload intent configuration before storage upload', async () => {
    hoisted.createClaimUploadIntentToken.mockImplementationOnce(() => {
      throw new Error('missing secret');
    });

    const response = await POST(createEvidenceUploadRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Upload configuration error' });
    expect(hoisted.upload).not.toHaveBeenCalled();
    expect(hoisted.confirmAdminUpload).not.toHaveBeenCalled();
  });
});
