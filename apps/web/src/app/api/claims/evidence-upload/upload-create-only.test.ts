import { beforeEach, expect, it, vi } from 'vitest';
import { uploadEvidenceObject } from './_upload';
const m = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@/lib/storage/service-role', () => ({ uploadTenantObject: m.upload }));
vi.mock('@/features/claims/upload/server/shared-upload', () => ({
  createClaimUploadIntentToken: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

it('creates evidence once and refuses an overwrite at the same path', async () => {
  m.upload
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: { message: 'The resource already exists' } });
  const params = {
    bucket: 'claim-evidence',
    storageContentType: 'application/pdf',
    storagePath: 'pii/tenants/t1/claims/c1/f1.pdf',
    tenantId: 't1',
    file: {
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('%PDF-1.7').buffer),
    } as File,
  };
  expect(await uploadEvidenceObject(params)).toBeNull();
  const response = await uploadEvidenceObject(params);
  expect(response?.status).toBe(500);
  expect(m.upload).toHaveBeenCalledTimes(2);
  expect(m.upload).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ upsert: false, path: params.storagePath })
  );
  expect(m.upload).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ upsert: false, path: params.storagePath })
  );
});
