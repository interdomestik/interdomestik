import { sql } from 'drizzle-orm';

import { assertRlsConnectionRoleReady, dbRls } from './db';
import { assertRlsRoleIdentifier } from './rls-role-assertion';

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

function setLocalRoleSql(role: string) {
  const safeRole = assertRlsRoleIdentifier(role);
  return sql.raw(`set local role "${safeRole}"`);
}

export async function withTenantContext<T>(
  context: TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  const tenantId = assertTenantId(context.tenantId);
  const effectiveDbRole = context.dbRole?.trim() || CONFIGURED_RLS_ROLE;

  await assertRlsConnectionRoleReady();

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
