import type { TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/** Relational-query surface of the transaction supplied by the tenant authority. */
export type NumberResolverLookupTx = Pick<TenantTransaction, 'query'>;

/**
 * Runs a number-resolver lookup inside the request session's tenant transaction. The lookup sees
 * only the transaction's query surface.
 */
export function runNumberResolverInTenantContext(
  authority: TenantAuthority,
  lookup: (tx: NumberResolverLookupTx) => Promise<string | null>
): Promise<string | null> {
  return withTenantAuthority(authority, lookup);
}
