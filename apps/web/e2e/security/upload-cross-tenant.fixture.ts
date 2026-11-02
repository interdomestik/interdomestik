import { E2E_USERS, and, claims, db, desc, eq, user } from '@interdomestik/database';
import { type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import { type UploadRequest } from '@/app/api/uploads/_core';

export type SeededE2EUser = (typeof E2E_USERS)[keyof typeof E2E_USERS];

export type SessionUser = {
  id: string;
  role: string | null;
  tenantId: string | null;
};

export type ClaimRecord = {
  id: string;
  tenantId: string;
  userId: string;
  agentId: string | null;
};

export type ProjectTenantContext = {
  actor: SeededE2EUser;
  injectedTenantId: string;
  targetTenantId: string;
};

export type ProjectStorageState = {
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

export const DEFAULT_UPLOAD: UploadRequest = {
  fileName: 'cross-tenant-proof.pdf',
  fileType: 'application/pdf',
  fileSize: 1024,
};

export function projectTenantContext(testInfo: TestInfo): ProjectTenantContext {
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

export async function requireSeededUser(seed: SeededE2EUser): Promise<SessionUser> {
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

export async function requireClaimForTenant(tenantId: string): Promise<ClaimRecord> {
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

export async function requireClaimNotOwnedBy(actor: SessionUser): Promise<ClaimRecord> {
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

export function requireTenant(userRow: SessionUser): string {
  if (!userRow.tenantId) {
    throw new Error(`Expected seeded user ${userRow.id} to carry a tenant`);
  }
  return userRow.tenantId;
}

export function sessionFor(userRow: SessionUser) {
  return {
    user: userRow,
  };
}

export function projectBaseOrigin(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL?.toString();
  if (!baseURL) {
    throw new Error('Expected Playwright project baseURL');
  }
  return new URL(baseURL).origin;
}

export function projectExtraHeaders(testInfo: TestInfo): Record<string, string> {
  return (testInfo.project.use.extraHTTPHeaders ?? {}) as Record<string, string>;
}

export function projectStorageStatePath(testInfo: TestInfo): string {
  const storageState = testInfo.project.use.storageState;
  if (typeof storageState !== 'string') {
    throw new TypeError('Expected Playwright project storageState path');
  }
  return storageState;
}

export function hasProjectStorageState(testInfo: TestInfo): boolean {
  return typeof testInfo.project.use.storageState === 'string';
}

export async function projectStorageStateWithForgedTenantCookie(
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
