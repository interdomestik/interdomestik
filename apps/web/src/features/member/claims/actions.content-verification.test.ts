import { describe, expect, it } from 'vitest';
import { getUploadActionMocks } from './actions-mocks.spec';
import { confirmUpload } from './actions';
import { createConfirmUploadParams } from './actions.test-fixtures';

const m = getUploadActionMocks();

describe('member document persistence after signature verification', () => {
  it('deletes a renamed text file and writes no metadata, consent or workflow', async () => {
    m.readPrefix.mockResolvedValueOnce(new TextEncoder().encode('text renamed to PDF'));
    expect(
      await confirmUpload(createConfirmUploadParams({ aiExtractionConsentGranted: true }))
    ).toEqual({
      success: false,
      error: 'evidence_content_mismatch',
      status: 409,
    });
    expect(m.remove).toHaveBeenCalledWith(['pii/tenants/tenant-1/claims/claim-1/uuid-1.pdf']);
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.queueClaimDocumentAiWorkflows).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it('fails closed without deleting when the content cannot be checked', async () => {
    m.readPrefix.mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await confirmUpload(createConfirmUploadParams())).toMatchObject({
      success: false,
      error: 'evidence_upload_failed',
    });
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
});
