import type { TenantTransaction } from '@interdomestik/database';

/**
 * The tenant transaction a CRM persistence function runs on. CRM repositories open it with
 * `withTenantAuthority` from the `TenantAuthority` they were built with and hand it only to
 * directly declared functions; there is no ambient client default and no injected executor.
 */
export type CrmTenantExecutor = TenantTransaction;
