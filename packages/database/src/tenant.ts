import { sql } from 'drizzle-orm';

import { assertRlsConnectionRoleReady, dbRls } from './db';
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

const CONFIGURED_RLS_ROLE = process.env.DB_RLS_ROLE?.trim() || null;

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

export async function withTenantContext<T>(
  context: TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  const tenantId = assertNonEmptyTenantId(context.tenantId, 'tenantId');
  const accessTenantId = resolveAccessTenantId(context, tenantId);
  const effectiveDbRole = context.dbRole?.trim() || CONFIGURED_RLS_ROLE;

  await assertRlsConnectionRoleReady();

  return dbRls.transaction(async tx => {
    if (effectiveDbRole) {
      await tx.execute(setLocalRoleSql(effectiveDbRole));
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

export async function withTenantDb<T>(
  context: TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  return withTenantContext(context, action);
}
