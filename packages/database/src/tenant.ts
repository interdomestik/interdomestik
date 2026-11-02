import { sql } from 'drizzle-orm';

import { assertRlsConnectionRoleReady, dbRls } from './db';
import { assertRlsRoleIdentifier } from './rls-role-assertion';
import type { TenantAuthority } from './tenant-authority';
import { resolveTenantContext, type TenantContext } from './tenant-context-resolution';

export type { TenantContext } from './tenant-context-resolution';

export type TenantTransaction = Parameters<typeof dbRls.transaction>[0] extends (
  tx: infer T
) => Promise<unknown>
  ? T
  : never;

const CONFIGURED_RLS_ROLE = process.env.DB_RLS_ROLE?.trim() || null;

function setLocalRoleSql(role: string) {
  const safeRole = assertRlsRoleIdentifier(role);
  return sql.raw(`set local role "${safeRole}"`);
}

export async function withTenantContext<T>(
  context: TenantAuthority | TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  const { tenantId, accessTenantId, role } = resolveTenantContext(context);
  // The database role comes only from deployment configuration, never from a caller.
  const effectiveDbRole = CONFIGURED_RLS_ROLE;

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
    if (role) {
      await tx.execute(sql`select set_config('app.user_role', ${role}, true)`);
    }
    return action(tx);
  });
}

export async function withTenantDb<T>(
  context: TenantAuthority | TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  return withTenantContext(context, action);
}
