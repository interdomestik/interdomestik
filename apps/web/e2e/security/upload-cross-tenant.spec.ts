import { E2E_USERS, and, claims, db, desc, eq, user } from '@interdomestik/database';
import { expect, request as playwrightRequest, test, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';

import {
  createSignedUploadCore,
  DEFAULT_BUCKET,
  MAX_FILE_SIZE_BYTES,
  type UploadRequest,
} from '@/app/api/uploads/_core';
import {
  assertEvidenceStoragePath,
  buildEvidenceStoragePath,
} from '@/features/claims/upload/server/storage-path';

type SeededE2EUser = (typeof E2E_USERS)[keyof typeof E2E_USERS];

type SessionUser = {
  id: string;
  role: string | null;
  tenantId: string | null;
};

type ClaimRecord = {
  id: string;
  tenantId: string;
  userId: string;
  agentId: string | null;
};

type ProjectTenantContext = {
  actor: SeededE2EUser;
  injectedTenantId: string;
  targetTenantId: string;
};

type ProjectStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

const DEFAULT_UPLOAD: UploadRequest = {
  fileName: 'cross-tenant-proof.pdf',
  fileType: 'application/pdf',
  fileSize: 1024,
};

function projectTenantContext(testInfo: TestInfo): ProjectTenantContext {
  if (testInfo.project.name.includes('mk')) {
    return {
      actor: E2E_USERS.MK_MEMBER,
      injectedTenantId: E2E_USERS.KS_MEMBER.tenantId,
      targetTenantId: E2E_USERS.KS_MEMBER.tenantId,
    };
  }

  return {
    actor: E2E_USERS.KS_MEMBER,
    injectedTenantId: E2E_USERS.MK_MEMBER.tenantId,
    targetTenantId: E2E_USERS.MK_MEMBER.tenantId,
  };
}

async function requireSeededUser(seed: SeededE2EUser): Promise<SessionUser> {
  const row = await db.query.user.findFirst({
    where: and(eq(user.email, seed.email), eq(user.tenantId, seed.tenantId)),
    columns: { id: true, role: true, tenantId: true },
  });

  if (!row?.id || row.tenantId !== seed.tenantId) {
    throw new Error(`Expected seeded user ${seed.email} in ${seed.tenantId}`);
  }

  return {
    id: row.id,
    role: row.role,
    tenantId: row.tenantId,
  };
}

async function requireClaimForTenant(tenantId: string): Promise<ClaimRecord> {
  const row = await db.query.claims.findFirst({
    where: eq(claims.tenantId, tenantId),
    columns: { id: true, tenantId: true, userId: true, agentId: true },
    orderBy: [desc(claims.createdAt), desc(claims.id)],
  });

  if (!row?.id || row.tenantId !== tenantId) {
    throw new Error(`Expected seeded claim in ${tenantId}`);
  }

  return row;
}

async function requireClaimNotOwnedBy(actor: SessionUser): Promise<ClaimRecord> {
  if (!actor.tenantId) {
    throw new Error('Expected tenant-scoped actor session');
  }

  const rows = await db.query.claims.findMany({
    where: eq(claims.tenantId, actor.tenantId),
    columns: { id: true, tenantId: true, userId: true, agentId: true },
    orderBy: [desc(claims.createdAt), desc(claims.id)],
    limit: 50,
  });
  const claim = rows.find(row => row.userId !== actor.id);

  if (!claim) {
    throw new Error(`Expected seeded ${actor.tenantId} claim not owned by ${actor.id}`);
  }

  return claim;
}

function sessionFor(userRow: SessionUser) {
  return {
    user: userRow,
  };
}

function projectBaseOrigin(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL?.toString();
  if (!baseURL) {
    throw new Error('Expected Playwright project baseURL');
  }
  return new URL(baseURL).origin;
}

function projectExtraHeaders(testInfo: TestInfo): Record<string, string> {
  return (testInfo.project.use.extraHTTPHeaders ?? {}) as Record<string, string>;
}

function projectStorageStatePath(testInfo: TestInfo): string {
  const storageState = testInfo.project.use.storageState;
  if (typeof storageState !== 'string') {
    throw new TypeError('Expected Playwright project storageState path');
  }
  return storageState;
}

function hasProjectStorageState(testInfo: TestInfo): boolean {
  return typeof testInfo.project.use.storageState === 'string';
}

async function projectStorageStateWithForgedTenantCookie(
  testInfo: TestInfo,
  injectedTenantId: string
): Promise<ProjectStorageState> {
  const storageState = JSON.parse(await fs.readFile(projectStorageStatePath(testInfo), 'utf8')) as {
    cookies?: ProjectStorageState['cookies'];
    origins?: ProjectStorageState['origins'];
  };
  const { hostname } = new URL(projectBaseOrigin(testInfo));
  const forgedTenantCookie: ProjectStorageState['cookies'][number] = {
    name: 'tenantId',
    value: injectedTenantId,
    domain: hostname,
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  };

  return {
    ...storageState,
    cookies: [
      ...(storageState.cookies ?? []).filter(cookie => cookie.name !== forgedTenantCookie.name),
      forgedTenantCookie,
    ],
    origins: storageState.origins ?? [],
  };
}

test.describe('upload cross-tenant authorization @security', () => {
  test('createSignedUploadCore returns 404 for a foreign-tenant claimId', async () => {
    const actor = await requireSeededUser(E2E_USERS.KS_MEMBER);
    const foreignClaim = await requireClaimForTenant(E2E_USERS.MK_MEMBER.tenantId);

    const result = await createSignedUploadCore({
      session: sessionFor(actor),
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
