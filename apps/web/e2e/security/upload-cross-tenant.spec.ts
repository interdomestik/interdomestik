import { E2E_USERS } from '@interdomestik/database';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import {
  DEFAULT_UPLOAD,
  hasProjectStorageState,
  projectBaseOrigin,
  projectExtraHeaders,
  projectStorageStatePath,
  projectStorageStateWithForgedTenantCookie,
  projectTenantContext,
  requireClaimForTenant,
  requireClaimNotOwnedBy,
  requireSeededUser,
  requireTenant,
  sessionFor,
} from './upload-cross-tenant.fixture';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import {
  createSignedUploadCore,
  DEFAULT_BUCKET,
  MAX_FILE_SIZE_BYTES,
} from '@/app/api/uploads/_core';
import {
  assertEvidenceStoragePath,
  buildEvidenceStoragePath,
} from '@/features/claims/upload/server/storage-path';

test.describe('upload cross-tenant authorization @security', () => {
  test('createSignedUploadCore returns 404 for a foreign-tenant claimId', async () => {
    const actor = await requireSeededUser(E2E_USERS.KS_MEMBER);
    const foreignClaim = await requireClaimForTenant(E2E_USERS.MK_MEMBER.tenantId);

    const result = await createSignedUploadCore({
      session: sessionFor(actor),
      authority: mintTestTenantAuthority(requireTenant(actor)),
      input: {
        ...DEFAULT_UPLOAD,
        claimId: foreignClaim.id,
      },
      bucket: DEFAULT_BUCKET,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected cross-tenant claimId to be rejected');
    }
    expect(result.status).toBe(404);
    expect(result.error).toBe('Claim not found');
  });

  test('POST /api/uploads returns 404 for a foreign-tenant claimId', async ({}, testInfo) => {
    test.skip(!hasProjectStorageState(testInfo), 'Project does not provide upload API auth state');

    const { targetTenantId } = projectTenantContext(testInfo);
    const foreignClaim = await requireClaimForTenant(targetTenantId);
    const api = await playwrightRequest.newContext({
      baseURL: projectBaseOrigin(testInfo),
      extraHTTPHeaders: projectExtraHeaders(testInfo),
      storageState: projectStorageStatePath(testInfo),
    });

    try {
      const response = await api.post('/api/uploads', {
        data: {
          ...DEFAULT_UPLOAD,
          claimId: foreignClaim.id,
        },
      });

      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: 'Claim not found' });
    } finally {
      await api.dispose();
    }
  });

  test('createSignedUploadCore returns 403 for a member uploading to another same-tenant owner claim', async () => {
    const actor = await requireSeededUser(E2E_USERS.KS_MEMBER);
    const otherOwnerClaim = await requireClaimNotOwnedBy(actor);

    const result = await createSignedUploadCore({
      session: sessionFor({ ...actor, role: 'member' }),
      authority: mintTestTenantAuthority(requireTenant(actor)),
      input: {
        ...DEFAULT_UPLOAD,
        claimId: otherOwnerClaim.id,
      },
      bucket: DEFAULT_BUCKET,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected non-owner member upload to be rejected');
    }
    expect(result.status).toBe(403);
    expect(result.error).toBe('Forbidden');
  });

  test('POST /api/uploads ignores injected tenant headers and cookies for unassigned upload paths', async ({}, testInfo) => {
    test.skip(!hasProjectStorageState(testInfo), 'Project does not provide upload API auth state');

    const { actor, injectedTenantId } = projectTenantContext(testInfo);
    const api = await playwrightRequest.newContext({
      baseURL: projectBaseOrigin(testInfo),
      extraHTTPHeaders: projectExtraHeaders(testInfo),
      storageState: await projectStorageStateWithForgedTenantCookie(testInfo, injectedTenantId),
    });

    try {
      const response = await api.post('/api/uploads', {
        data: DEFAULT_UPLOAD,
        headers: {
          'x-tenant-id': injectedTenantId,
        },
      });

      expect(response.status()).toBe(200);
      const body = (await response.json()) as { upload?: { path?: string } };
      expect(body.upload?.path).toEqual(expect.any(String));
      expect(body.upload?.path).toContain(`/tenants/${actor.tenantId}/`);
      expect(body.upload?.path).not.toContain(`/tenants/${injectedTenantId}/`);
    } finally {
      await api.dispose();
    }
  });

  test('createSignedUploadCore returns 413 for files larger than 10MB', async () => {
    const actor = await requireSeededUser(E2E_USERS.KS_MEMBER);

    const result = await createSignedUploadCore({
      session: sessionFor(actor),
      authority: mintTestTenantAuthority(requireTenant(actor)),
      input: {
        ...DEFAULT_UPLOAD,
        fileSize: MAX_FILE_SIZE_BYTES + 1,
      },
      bucket: DEFAULT_BUCKET,
    });

    expect(result).toEqual({ ok: false, status: 413, error: 'File too large' });
  });

  test('createSignedUploadCore returns 415 for non-allowlisted file types', async () => {
    const actor = await requireSeededUser(E2E_USERS.KS_MEMBER);

    const result = await createSignedUploadCore({
      session: sessionFor(actor),
      authority: mintTestTenantAuthority(requireTenant(actor)),
      input: {
        ...DEFAULT_UPLOAD,
        fileName: 'cross-tenant-proof.exe',
        fileType: 'application/x-msdownload',
      },
      bucket: DEFAULT_BUCKET,
    });

    expect(result).toEqual({ ok: false, status: 415, error: 'File type not allowed' });
  });

  test('assertEvidenceStoragePath rejects a forged initial-upload actor path', () => {
    const storagePath = buildEvidenceStoragePath({
      actorId: 'member-a',
      bucket: DEFAULT_BUCKET,
      fileId: 'evidence-1',
      fileName: 'proof.pdf',
      shape: 'initial',
      tenantId: E2E_USERS.KS_MEMBER.tenantId,
    });

    expect(() =>
      assertEvidenceStoragePath({
        actorId: 'member-b',
        bucket: DEFAULT_BUCKET,
        fileId: 'evidence-1',
        shape: 'initial',
        storagePath,
        tenantId: E2E_USERS.KS_MEMBER.tenantId,
      })
    ).toThrow();
  });
});
