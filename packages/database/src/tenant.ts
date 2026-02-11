import { sql } from 'drizzle-orm';

import { dbRls } from './db';

export type TenantContext = {
  tenantId: string;
  role?: string | null;
  dbRole?: string | null;
};

export type TenantTransaction = Parameters<typeof dbRls.transaction>[0] extends (
  tx: infer T
) => Promise<unknown>
  ? T
  : never;

const CONFIGURED_RLS_ROLE = process.env.DB_RLS_ROLE?.trim() || null;

function assertTenantId(tenantId: string): string {
  const normalized = tenantId.trim();
  if (!normalized) {
    throw new Error('withTenantContext requires a non-empty tenantId');
  }
  return normalized;
}

function assertRoleIdentifier(role: string): string {
  const normalized = role.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(normalized)) {
    throw new Error(`Invalid DB role for RLS context: ${role}`);
  }
  return normalized;
}

function setLocalRoleSql(role: string) {
  const safeRole = assertRoleIdentifier(role);
  return sql.raw(`set local role "${safeRole}"`);
}

export async function withTenantContext<T>(
  context: TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  const tenantId = assertTenantId(context.tenantId);
  const effectiveDbRole = context.dbRole?.trim() || CONFIGURED_RLS_ROLE;

  return dbRls.transaction(async tx => {
    if (effectiveDbRole) {
      await tx.execute(setLocalRoleSql(effectiveDbRole));
    }
    await tx.execute(sql`set local row_security = on`);
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
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
