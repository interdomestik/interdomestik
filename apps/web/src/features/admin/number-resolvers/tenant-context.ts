import { withTenantContext, type TenantTransaction } from '@interdomestik/database';

/** Relational-query surface of the transaction supplied by withTenantContext. */
export type NumberResolverLookupTx = Pick<TenantTransaction, 'query'>;

export interface NumberResolverTenantContext {
  tenantId: string;
  role: string | null;
}

/**
 * Runs a number-resolver lookup inside the existing tenant transaction boundary.
 * Context is passed through unchanged; the lookup sees only the transaction's query surface.
 */
export function runNumberResolverInTenantContext(
  context: NumberResolverTenantContext,
  lookup: (tx: NumberResolverLookupTx) => Promise<string | null>
): Promise<string | null> {
  return withTenantContext({ tenantId: context.tenantId, role: context.role }, lookup);
}
