import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageUpload = vi.fn();
const storageDownload = vi.fn();
const createSignedUrl = vi.fn();
const createSignedUploadUrl = vi.fn();
const storageList = vi.fn();
const storageFrom = vi.fn(() => ({
  createSignedUploadUrl,
  createSignedUrl,
  download: storageDownload,
  list: storageList,
  upload: storageUpload,
}));
const createAdminClient = vi.fn(() => ({
  storage: {
    from: storageFrom,
  },
}));
const VALID_CLAIM_UPLOAD_TARGET = {
  bucket: 'claim-evidence',
  family: 'claims' as const,
  path: 'pii/tenants/tenant-a/claims/user-1/unassigned/file.pdf',
  tenantId: 'tenant-a',
};
const CROSS_TENANT_UPLOAD_TARGET = {
  ...VALID_CLAIM_UPLOAD_TARGET,
  path: 'pii/tenants/tenant-b/claims/claim-1/file.pdf',
};

vi.mock('@interdomestik/database', () => ({
  createAdminClient,
}));

function stubLocalE2EUploadSigningEnv() {
  vi.stubEnv('INTERDOMESTIK_E2E_FAKE_STORAGE_SIGNING', '1');
  vi.stubEnv('INTERDOMESTIK_LOCAL_E2E', '1');
  vi.stubEnv('PLAYWRIGHT', '1');
}

describe('service-role storage boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('asserts tenant prefix before creating signed upload URLs', async () => {
    const { createTenantSignedUploadUrl } = await import('./service-role');

    await expect(
      createTenantSignedUploadUrl({
        bucket: 'claim-evidence',
        family: 'claims',
        path: 'pii/tenants/tenant-b/claims/claim-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).rejects.toThrow(/tenant-a/);

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('keeps tenant prefix assertion before deterministic E2E upload signing', async () => {
    stubLocalE2EUploadSigningEnv();

    const { createTenantSignedUploadUrl } = await import('./service-role');

    await expect(createTenantSignedUploadUrl(CROSS_TENANT_UPLOAD_TARGET)).rejects.toThrow(
      /tenant-a/
    );

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('returns deterministic signed upload data only for local E2E storage signing', async () => {
    stubLocalE2EUploadSigningEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', '/configured-storage/');

    const { createTenantSignedUploadUrl } = await import('./service-role');

    const result = await createTenantSignedUploadUrl(VALID_CLAIM_UPLOAD_TARGET);

    expect(result).toEqual({
      data: expect.objectContaining({
        path: VALID_CLAIM_UPLOAD_TARGET.path,
        signedUrl: expect.stringContaining(
          '/configured-storage/storage/v1/object/upload/sign/claim-evidence/pii/tenants/tenant-a/claims/user-1/unassigned/file.pdf'
        ),
        token: expect.any(String),
      }),
      error: null,
    });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('uses Supabase upload signing when fake signing is not in local E2E mode', async () => {
    vi.stubEnv('INTERDOMESTIK_E2E_FAKE_STORAGE_SIGNING', '1');
    createSignedUploadUrl.mockResolvedValue({
      data: { path: 'remote-path', signedUrl: 'https://signed.example/upload', token: 'token-1' },
      error: null,
    });
    const { createTenantSignedUploadUrl } = await import('./service-role');

    const result = await createTenantSignedUploadUrl(VALID_CLAIM_UPLOAD_TARGET);

    expect(result).toEqual({
      data: { path: 'remote-path', signedUrl: 'https://signed.example/upload', token: 'token-1' },
      error: null,
    });
    expect(storageFrom).toHaveBeenCalledWith('claim-evidence');
    expect(createSignedUploadUrl).toHaveBeenCalledWith(VALID_CLAIM_UPLOAD_TARGET.path, {
      upsert: true,
    });
  });

  it('passes valid signed download requests to Supabase with the default TTL', async () => {
    const { SIGNED_DOWNLOAD_TTL_SECONDS, createTenantSignedDownloadUrl } =
      await import('./service-role');
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example' } });

    await createTenantSignedDownloadUrl({
      bucket: 'policies',
      family: 'policies',
      path: 'pii/tenants/tenant-a/policies/user-1/file.pdf',
      tenantId: 'tenant-a',
    });

    expect(storageFrom).toHaveBeenCalledWith('policies');
    expect(createSignedUrl).toHaveBeenCalledWith(
      'pii/tenants/tenant-a/policies/user-1/file.pdf',
      SIGNED_DOWNLOAD_TTL_SECONDS
    );
  });

  it('rejects signed download TTLs above the operation cap', async () => {
    const { createTenantSignedDownloadUrl } = await import('./service-role');

    await expect(
      createTenantSignedDownloadUrl({
        bucket: 'policies',
        expiresInSeconds: 301,
        family: 'policies',
        operation: 'documentDownload',
        path: 'pii/tenants/tenant-a/policies/user-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).rejects.toThrow(/exceeds documentDownload cap 300s/);

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('allows voice-note previews to use the reviewed ten-minute TTL cap', async () => {
    const { VOICE_NOTE_PREVIEW_TTL_SECONDS, createTenantSignedDownloadUrl } =
      await import('./service-role');
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example' } });

    await createTenantSignedDownloadUrl({
      bucket: 'claim-evidence',
      expiresInSeconds: VOICE_NOTE_PREVIEW_TTL_SECONDS,
      family: 'claims',
      operation: 'voiceNotePreview',
      path: 'pii/tenants/tenant-a/claims/user-1/unassigned/voice.webm',
      tenantId: 'tenant-a',
    });

    expect(createSignedUrl).toHaveBeenCalledWith(
      'pii/tenants/tenant-a/claims/user-1/unassigned/voice.webm',
      VOICE_NOTE_PREVIEW_TTL_SECONDS
    );
  });

  it('supports upload, download, and single-file list operations after path assertion', async () => {
    const { downloadTenantObject, listTenantObjectsForSingleFile, uploadTenantObject } =
      await import('./service-role');
    const target = {
      bucket: 'claim-evidence',
      family: 'claims' as const,
      path: 'pii/tenants/tenant-a/claims/claim-1/file.pdf',
      tenantId: 'tenant-a',
    };

    await uploadTenantObject({
      ...target,
      body: Buffer.from('pdf'),
      contentType: 'application/pdf',
      upsert: true,
    });
    await downloadTenantObject(target);
    await listTenantObjectsForSingleFile(target);

    expect(storageUpload).toHaveBeenCalledWith(target.path, Buffer.from('pdf'), {
      contentType: 'application/pdf',
      upsert: true,
    });
    expect(storageDownload).toHaveBeenCalledWith(target.path);
    expect(storageList).toHaveBeenCalledWith('pii/tenants/tenant-a/claims/claim-1', {
      limit: 100,
      search: 'file.pdf',
    });
  });
});
