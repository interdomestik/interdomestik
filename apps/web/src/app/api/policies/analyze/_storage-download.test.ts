import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadTenantObject: vi.fn(),
}));

vi.mock('@/lib/storage/service-role', () => ({
  downloadTenantObject: mocks.downloadTenantObject,
}));

import { downloadPolicyFileWithRetry } from './_storage-download';

function storageBlob(value: string) {
  return {
    arrayBuffer: async () => Buffer.from(value).buffer,
  };
}

describe('downloadPolicyFileWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient policy storage download failures', async () => {
    mocks.downloadTenantObject
      .mockResolvedValueOnce({ data: null, error: { statusCode: 500, message: 'storage 500' } })
      .mockResolvedValueOnce({ data: storageBlob('policy-file'), error: null });

    const result = await downloadPolicyFileWithRetry({
      bucket: 'policies',
      filePath: 'pii/tenants/tenant-1/policies/user-1/file.pdf',
      tenantId: 'tenant-1',
    });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mocks.downloadTenantObject).toHaveBeenCalledTimes(2);
  });

  it('keeps missing valid objects permanent after one attempt', async () => {
    mocks.downloadTenantObject.mockResolvedValue({
      data: null,
      error: { statusCode: 404, message: 'Object not found' },
    });

    await expect(
      downloadPolicyFileWithRetry({
        bucket: 'policies',
        filePath: 'pii/tenants/tenant-1/policies/user-1/missing.pdf',
        tenantId: 'tenant-1',
      })
    ).rejects.toThrow('Failed to download queued policy document.');

    expect(mocks.downloadTenantObject).toHaveBeenCalledTimes(1);
  });
});
