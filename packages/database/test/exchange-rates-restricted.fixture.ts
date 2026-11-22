import type postgres from 'postgres';

import { quoteIdentifier } from './rls-test-connection';

export const runtimeRole = 'interdomestik_runtime_rls';

export function restricted<T>(
  client: postgres.Sql,
  accessTenant: string | undefined,
  run: (tx: postgres.TransactionSql) => Promise<T>,
  roleName = runtimeRole,
  isolation: 'read committed' | 'repeatable read' = 'read committed',
  options: {
    homeTenant?: string;
    beforeRole?: (tx: postgres.TransactionSql) => Promise<void>;
  } = {}
) {
  return client.begin(`isolation level ${isolation}`, async tx => {
    await options.beforeRole?.(tx);
    await tx.unsafe(`set local role ${quoteIdentifier(roleName)}`);
    await tx`set local row_security = on`;
    if (accessTenant !== undefined) {
      await tx`select set_config('app.current_access_tenant_id', ${accessTenant}, true),
        set_config('app.current_tenant_id', ${options.homeTenant ?? accessTenant}, true)`;
    }
    return run(tx);
  });
}
