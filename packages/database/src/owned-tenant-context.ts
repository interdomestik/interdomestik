import { drizzle } from 'drizzle-orm/postgres-js';

import { assertRlsConnectionRoleReady, captureConfiguredRlsRole } from './db';
import { CONFIGURATION, createQueryClient, isProduction } from './database-connection';
import { assertDatabaseConfigurationUnchanged } from './database-configuration';
import { runTenantTransaction } from './tenant-transaction';

// Bind this private pool to the same captured profile and configured role as readiness.
assertDatabaseConfigurationUnchanged();
const CONFIGURED_RLS_ROLE = captureConfiguredRlsRole();

// This client never enters legacy globals or the public database barrel.
let ownedDatabase: ReturnType<typeof drizzle> | undefined;

function database() {
  if (!ownedDatabase) {
    const url = isProduction
      ? CONFIGURATION.DATABASE_URL_RLS
      : (CONFIGURATION.DATABASE_URL_RLS ?? CONFIGURATION.DATABASE_URL);
    if (!url) throw new Error('Restricted database configuration is missing');
    ownedDatabase = drizzle(createQueryClient(url, 'rls', 1));
  }
  return ownedDatabase;
}

type OwnedTransaction = Parameters<Parameters<ReturnType<typeof database>['transaction']>[0]>[0];

// Internal only: the closed operation owns this callback and never exposes tx.
export function withOwnedTenantContext<T>(
  tenantId: string,
  action: (tx: OwnedTransaction) => Promise<T>
): Promise<T> {
  return runTenantTransaction<T, OwnedTransaction>(
    database(),
    assertRlsConnectionRoleReady,
    { tenantId, role: 'admin' },
    action,
    true,
    CONFIGURED_RLS_ROLE
  );
}
