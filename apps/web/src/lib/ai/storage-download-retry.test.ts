import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadTenantObject: vi.fn(),
}));

vi.mock('@/lib/storage/service-role', () => ({
  downloadTenantObject: mocks.downloadTenantObject,
}));

import { downloadClaimAiFileWithRetry } from './claim-storage-download';
import { downloadAiStorageObjectWithRetry } from './storage-download-retry';
import { downloadPolicyFileWithRetry } from '@/app/api/policies/analyze/_storage-download';

function storageBlob(value: string) {
  return {
    arrayBuffer: async () => Buffer.from(value).buffer,
  };
}

describe('downloadAiStorageObjectWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient storage failures before returning a buffer', async () => {
    mocks.downloadTenantObject
      .mockResolvedValueOnce({ data: null, error: { statusCode: 503, message: 'storage 503' } })
      .mockResolvedValueOnce({ data: storageBlob('policy-file'), error: null });

    const result = await downloadAiStorageObjectWithRetry({
      bucket: 'policies',
      context: 'policy analysis download',
      failureMessage: 'Failed to download queued policy document.',
      family: 'policies',
      filePath: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
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

  it('keeps missing valid objects permanent after one attempt', async () => {
    mocks.downloadTenantObject.mockResolvedValue({
      data: null,
      error: { statusCode: 404, message: 'Object not found' },
    });

    await expect(
      downloadAiStorageObjectWithRetry({
        bucket: 'policies',
        context: 'policy analysis download',
        failureMessage: 'Failed to download queued policy document.',
        family: 'policies',
        filePath: 'pii/tenants/tenant-1/policies/user-1/missing.pdf',
        tenantId: 'tenant-1',
      })
    ).rejects.toThrow('Failed to download queued policy document.');

    expect(mocks.downloadTenantObject).toHaveBeenCalledTimes(1);
  });

  it('keeps policy wrapper storage context scoped to policy downloads', async () => {
    mocks.downloadTenantObject.mockResolvedValue({ data: storageBlob('policy-file'), error: null });

    await downloadPolicyFileWithRetry({
      bucket: 'policies',
      filePath: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      tenantId: 'tenant-1',
    });

    expect(mocks.downloadTenantObject).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'policy analysis download',
        family: 'policies',
      })
    );
  });
});
