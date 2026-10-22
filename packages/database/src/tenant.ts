import { assertRlsConnectionRoleReady, captureConfiguredRlsRole, dbRls } from './db';
import {
  runTenantTransaction,
  type TenantContext,
  type TenantTransaction,
} from './tenant-transaction';

export type { TenantContext, TenantTransaction } from './tenant-transaction';

const CONFIGURED_RLS_ROLE = captureConfiguredRlsRole();

export async function withTenantContext<T>(
  context: TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  return runTenantTransaction<T, TenantTransaction>(
    dbRls,
    assertRlsConnectionRoleReady,
    context,
    action,
    false,
    CONFIGURED_RLS_ROLE
  );
}

export async function withTenantDb<T>(
  context: TenantContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  return withTenantContext(context, action);
}
