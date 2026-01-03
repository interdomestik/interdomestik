import { and, branches, db, eq, userRoles } from '@interdomestik/database';
import { randomUUID } from 'crypto';
import { isNull } from 'drizzle-orm';

import type { ActionResult, UserSession } from '../types';
import { requireTenantAdminSession } from './access';

const DEFAULT_TENANT_ID = 'tenant_mk';

function resolveTenantId(session: UserSession, requestedTenantId?: string | null): string {
  if (requestedTenantId) {
    if (session.user.role === 'super_admin') return requestedTenantId;

    // Non-super-admin users may only operate within their current tenant.
    if (session.user.tenantId && session.user.tenantId === requestedTenantId) {
      return requestedTenantId;
    }

    throw new Error('Unauthorized');
  }

  return session.user.tenantId ?? DEFAULT_TENANT_ID;
}

export async function listBranchesCore(params: { session: UserSession | null; tenantId?: string }) {
  const session = await requireTenantAdminSession(params.session);
  const tenantId = resolveTenantId(session, params.tenantId);

  return db.query.branches.findMany({
    where: eq(branches.tenantId, tenantId),
    orderBy: (b, { asc }) => [asc(b.name)],
  });
}

export async function createBranchCore(params: {
  session: UserSession | null;
  tenantId?: string;
  name: string;
  code?: string | null;
}) {
  const session = await requireTenantAdminSession(params.session);
  const tenantId = resolveTenantId(session, params.tenantId);

  const name = params.name.trim();
  if (!name) {
    return { error: 'Branch name is required' } satisfies ActionResult;
  }

  await db.insert(branches).values({
    id: randomUUID(),
    tenantId,
    name,
    code: params.code?.trim() || null,
  });

  return { success: true } satisfies ActionResult;
}

export async function listUserRolesCore(params: {
  session: UserSession | null;
  tenantId?: string;
  userId?: string;
}) {
  const session = await requireTenantAdminSession(params.session);
  const tenantId = resolveTenantId(session, params.tenantId);

  if (params.userId) {
    return db.query.userRoles.findMany({
      where: and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, params.userId)),
    });
  }

  return db.query.userRoles.findMany({
    where: eq(userRoles.tenantId, tenantId),
  });
}

export async function grantUserRoleCore(params: {
  session: UserSession | null;
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<ActionResult> {
  const session = await requireTenantAdminSession(params.session);
  const tenantId = resolveTenantId(session, params.tenantId);

  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };

  // Ensure branch belongs to this tenant (when provided).
  const branchId = params.branchId ?? null;
  if (branchId) {
    const branch = await db.query.branches.findFirst({
      where: and(eq(branches.id, branchId), eq(branches.tenantId, tenantId)),
    });
    if (!branch) return { error: 'Invalid branch' };
  }

  await db.transaction(async tx => {
    // NOTE: Postgres UNIQUE indexes treat NULL values as distinct.
    // We enforce uniqueness for tenant-level roles (branchId IS NULL) at the app layer.
    if (!branchId) {
      await tx
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.tenantId, tenantId),
            eq(userRoles.userId, params.userId),
            eq(userRoles.role, role),
            isNull(userRoles.branchId)
          )
        );
    }

    await tx.insert(userRoles).values({
      id: randomUUID(),
      tenantId,
      userId: params.userId,
      role,
      branchId,
    });
  });

  return { success: true };
}

export async function revokeUserRoleCore(params: {
  session: UserSession | null;
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<ActionResult> {
  const session = await requireTenantAdminSession(params.session);
  const tenantId = resolveTenantId(session, params.tenantId);

  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };

  const branchId = params.branchId ?? null;

  await db
    .delete(userRoles)
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        eq(userRoles.userId, params.userId),
        eq(userRoles.role, role),
        branchId == null ? isNull(userRoles.branchId) : eq(userRoles.branchId, branchId)
      )
    );

  return { success: true };
}
