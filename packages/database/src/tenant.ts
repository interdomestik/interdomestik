import { assertDatabaseConfigurationUnchanged } from './database-configuration';
import { assertRlsConnectionRoleReady, captureConfiguredRlsRole, dbRls } from './db';
import {
  runTenantTransaction,
  type TenantContext,
  type TenantTransaction,
} from './tenant-transaction';

export type { TenantContext, TenantTransaction } from './tenant-transaction';

assertDatabaseConfigurationUnchanged();

export async function withTenantContext<T>(
  context: TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  const configuredRlsRole = captureConfiguredRlsRole();
  return runTenantTransaction<T, TenantTransaction>(
    dbRls,
    assertRlsConnectionRoleReady,
    context,
    action,
    false,
    configuredRlsRole
  );
}

export async function withTenantDb<T>(
  context: TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  return withTenantContext(context, action);
}
