import { sql, type SQL } from 'drizzle-orm';

import type { dbRls } from './db';
import { assertRlsRoleIdentifier } from './rls-role-assertion';

export type TenantContext = {
  tenantId: string;
  accessTenantId?: string | null;
  role?: string | null;
  dbRole?: string | null;
};

export type TenantTransaction = Parameters<typeof dbRls.transaction>[0] extends (
  tx: infer T
) => Promise<unknown>
  ? T
  : never;

function assertNonEmptyTenantId(tenantId: string, label: string): string {
  const normalized = tenantId.trim();
  if (!normalized) {
    throw new Error(`withTenantContext requires a non-empty ${label}`);
  }
  return normalized;
}

function resolveAccessTenantId(context: TenantContext, tenantId: string): string {
  if (context.accessTenantId === null || context.accessTenantId === undefined) {
    return tenantId;
  }
  return context.accessTenantId.trim() || tenantId;
}

function setLocalRoleSql(role: string) {
  const safeRole = assertRlsRoleIdentifier(role);
  return sql.raw(`set local role "${safeRole}"`);
}

type ContextExecutor = { execute(query: SQL): Promise<unknown> };

async function assertRestrictedServerRole(tx: ContextExecutor): Promise<void> {
  // PostgreSQL rejects the statement before any driver parser can change its result.
  await tx.execute(sql`select 1 / case when exists (
    select 1 from pg_catalog.pg_roles
    where rolname = session_user and not rolbypassrls and not rolsuper
  ) and exists (
    select 1 from pg_catalog.pg_roles
    where rolname = current_user and not rolbypassrls and not rolsuper
  ) then 1 else 0 end as restricted_role`);
}

export async function runTenantTransaction<T, TTransaction extends ContextExecutor>(
  database: { transaction(action: (tx: TTransaction) => Promise<T>): Promise<T> },
  assertReady: () => Promise<void>,
  context: TenantContext,
  action: (tx: TTransaction) => Promise<T>,
  verifyServerRole = false,
  configuredRlsRole: string | null = null
): Promise<T> {
  const tenantId = assertNonEmptyTenantId(context.tenantId, 'tenantId');
  const accessTenantId = resolveAccessTenantId(context, tenantId);
  const effectiveDbRole = context.dbRole?.trim() || configuredRlsRole;

  await assertReady();

  return database.transaction(async tx => {
    if (verifyServerRole) await assertRestrictedServerRole(tx);
    if (effectiveDbRole) {
      await tx.execute(setLocalRoleSql(effectiveDbRole));
      if (verifyServerRole) await assertRestrictedServerRole(tx);
    }
    await tx.execute(sql`set local row_security = on`);
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
    await tx.execute(
      sql`select set_config('app.current_access_tenant_id', ${accessTenantId}, true)`
    );
    if (context.role) {
      await tx.execute(sql`select set_config('app.user_role', ${context.role}, true)`);
    }
    return action(tx);
  });
}
