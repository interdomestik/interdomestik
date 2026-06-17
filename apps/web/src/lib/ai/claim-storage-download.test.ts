import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadTenantObject: vi.fn(),
}));

vi.mock('@/lib/storage/service-role', () => ({
  downloadTenantObject: mocks.downloadTenantObject,
}));

import { downloadClaimAiFileWithRetry } from './claim-storage-download';

function storageBlob(value: string) {
  return {
    arrayBuffer: async () => Buffer.from(value).buffer,
  };
}

describe('downloadClaimAiFileWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient storage failures before returning the buffer', async () => {
    mocks.downloadTenantObject
      .mockResolvedValueOnce({ data: null, error: { statusCode: 503, message: 'storage 503' } })
      .mockResolvedValueOnce({ data: storageBlob('claim-file'), error: null });

    const result = await downloadClaimAiFileWithRetry({
      bucket: 'claims-bucket',
      filePath: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
      tenantId: 'tenant-1',
    });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mocks.downloadTenantObject).toHaveBeenCalledTimes(2);
  });

  it('does not retry tenant storage assertion failures', async () => {
    const error = Object.assign(new Error('claim AI document download bucket mismatch'), {
      name: 'TenantStoragePathError',
    });
    mocks.downloadTenantObject.mockRejectedValue(error);

    await expect(
      downloadClaimAiFileWithRetry({
        bucket: 'wrong-bucket',
        filePath: 'pii/tenants/tenant-1/claims/claim-1/file.pdf',
        tenantId: 'tenant-1',
      })
    ).rejects.toThrow('bucket mismatch');

    expect(mocks.downloadTenantObject).toHaveBeenCalledTimes(1);
  });
});
