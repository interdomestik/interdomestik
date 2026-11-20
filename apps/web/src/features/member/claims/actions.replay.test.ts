import { expect, it } from 'vitest';
import { getUploadActionMocks } from './actions-mocks.spec';
import { confirmUpload } from './actions';
import { createConfirmUploadParams } from './actions.test-fixtures';
const m = getUploadActionMocks();

it('returns an exact persisted confirmation replay without storage reads or new writes', async () => {
  const params = createConfirmUploadParams();
  m.metadataDocumentRows.mockResolvedValue([
    {
      id: params.fileId,
      tenantId: 'tenant-1',
      claimId: params.claimId,
      name: params.originalName,
      filePath: params.storagePath,
      fileType: params.mimeType,
      fileSize: params.fileSize,
      bucket: params.uploadedBucket,
      category: 'evidence',
      uploadedBy: 'member-1',
    },
  ]);
  expect(await confirmUpload(params)).toEqual({ success: true });
  expect(m.readPrefix).not.toHaveBeenCalled();
  expect(m.listStorageObjects).not.toHaveBeenCalled();
  expect(m.remove).not.toHaveBeenCalled();
  expect(m.insert).not.toHaveBeenCalled();
  expect(m.queueClaimDocumentAiWorkflows).not.toHaveBeenCalled();
});
