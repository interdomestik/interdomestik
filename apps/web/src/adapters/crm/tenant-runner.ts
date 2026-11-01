import { withTenantContext } from '@interdomestik/database';
import { db } from '@interdomestik/database/db';

export type CrmTenantRunnerContext = {
  readonly tenantId: string;
  readonly role?: string;
};

/**
 * Runs a CRM repository operation inside the tenant RLS context.
 *
 * When the repository was constructed with an explicit executor (a test double or an
 * already-scoped tenant transaction) the operation runs on it unchanged. The default ambient
 * `db` client has no tenant context, so it is replaced by a `withTenantContext` transaction.
 */
export async function runInCrmTenantContext<TDatabase, TResult>(
  database: TDatabase,
  context: CrmTenantRunnerContext,
  action: (database: TDatabase) => PromiseLike<TResult>
): Promise<TResult> {
  if (database !== (db as unknown)) return action(database);
  return withTenantContext(context, async tx => action(tx as unknown as TDatabase));
}
