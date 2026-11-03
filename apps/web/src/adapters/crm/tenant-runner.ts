import type { TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/**
 * The executor a CRM repository may be constructed with: an already-scoped tenant transaction (or
 * a test double standing in for one). There is no ambient client default; a repository built
 * without an executor opens its own tenant transaction from the authority it was given.
 */
export type CrmTenantExecutor = TenantTransaction;

/**
 * Runs a CRM repository operation inside the tenant RLS context.
 *
 * When the repository was constructed with an executor (an already-scoped tenant transaction or a
 * test double) the operation runs on it unchanged. Otherwise the operation runs in a
 * `withTenantAuthority` transaction opened from the supplied `TenantAuthority`, so there is no path
 * that reaches an unscoped client.
 */
export async function runInCrmTenantContext<TExecutor, TResult>(
  executor: TExecutor | undefined,
  authority: TenantAuthority,
  action: (executor: TExecutor) => PromiseLike<TResult>
): Promise<TResult> {
  if (executor !== undefined) return action(executor);
  return withTenantAuthority(authority, async tx => action(tx as unknown as TExecutor));
}
