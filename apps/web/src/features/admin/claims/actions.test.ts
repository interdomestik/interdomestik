import { describe, expect, it } from 'vitest';
import {
  confirmAdminUpload,
  generateAdminUploadUrl,
  type ConfirmAdminUploadParams,
  type ConfirmAdminUploadResult,
  type GenerateAdminUploadUrlResult,
} from './actions';
import {
  confirmAdminUpload as confirmAdminUploadImpl,
  generateAdminUploadUrl as generateAdminUploadUrlImpl,
} from './actions/evidence-upload';

describe('admin claim action exports', () => {
  it('re-exports the admin upload action implementations', () => {
    expect(confirmAdminUpload).toBe(confirmAdminUploadImpl);
    expect(generateAdminUploadUrl).toBe(generateAdminUploadUrlImpl);
  });

  it('preserves the public upload action result shapes', () => {
    const uploadResult: GenerateAdminUploadUrlResult = {
      success: false,
      error: 'Unauthorized',
      status: 401,
    };
    const confirmResult: ConfirmAdminUploadResult = {
      success: false,
      error: 'Unauthorized',
      status: 401,
    };
    const params: ConfirmAdminUploadParams = {
      claimId: 'claim-1',
      storagePath: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
      fileSize: 42,
      fileId: 'file-1',
      uploadIntentToken: 'upload-intent-token',
    };

    expect(uploadResult.status).toBe(401);
    expect(confirmResult.status).toBe(401);
    expect(params.claimId).toBe('claim-1');
  });
});
