import { withTenantContext, type TenantTransaction } from './index';
import { isTenantAuthority, type TenantAuthority } from './tenant-authority';

// The authority-only entry to a tenant transaction. withTenantContext still accepts the legacy
// caller-built { tenantId } form, which the db-access guard admits only inside functions that are
// unchanged from the pinned reviewed tree. New and changed code calls this instead: the parameter
// type demands a TenantAuthority and the runtime check refuses anything that is not a registered
// token, so no value-flow analysis is needed to know the tenant came from a producer.
//
// It reaches withTenantContext through the package root so tests that mock the root module observe
// the same call they did before.
export async function withTenantAuthority<T>(
  authority: TenantAuthority,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  if (!isTenantAuthority(authority)) throw new Error('Unrecognized tenant authority');
  return withTenantContext(authority, action);
}
