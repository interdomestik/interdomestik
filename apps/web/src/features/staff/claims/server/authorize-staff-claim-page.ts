import { resolveStaffClaimReader } from '@interdomestik/domain-claims';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';

export type StaffClaimPageUser = Readonly<{
  id: string;
  role?: string | null;
  branchId?: string | null;
}>;

/**
 * The session authority for a staff claim page, only when the staff claim reader it grants is the
 * user the page rendered: same user, role and branch. The page and the readers then scope by one
 * session snapshot even when the cached sessions they read diverge, for example after a role or
 * branch change. Null when the request grants no such reader; other authorization failures
 * propagate.
 */
export async function authorizeStaffClaimPage(
  user: StaffClaimPageUser
): Promise<TenantAuthority | null> {
  const authority = await authorizeSessionUserTenant(user.id);
  if (!authority) return null;
  const reader = resolveStaffClaimReader(authority);
  if (
    reader?.staffId !== user.id ||
    reader.role !== user.role ||
    reader.branchId !== (user.branchId ?? null)
  ) {
    return null;
  }
  return authority;
}
