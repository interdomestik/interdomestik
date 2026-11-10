import 'server-only';

import { claims } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';

/** The predicate is re-applied by each reader inside its own tenant transaction. */
export function branchManagerClaimScope(authority: TenantAuthority, claimId: string) {
  const { tenantId, accessTenantId, principal, purpose } = readTenantAuthority(authority);
  if (
    purpose !== 'session' ||
    tenantId !== accessTenantId ||
    !deniesClaimMessageContent(principal?.role) ||
    !principal?.branchId
  )
    return null;
  return {
    tenantId,
    where: and(
      eq(claims.id, claimId),
      eq(claims.tenantId, tenantId),
      eq(claims.branchId, principal.branchId)
    ),
  };
}
