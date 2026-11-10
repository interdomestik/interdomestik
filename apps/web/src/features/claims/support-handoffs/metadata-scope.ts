import 'server-only';

import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { branches, supportHandoffs, user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq, gt, ilike, isNotNull, isNull, or, type SQL } from 'drizzle-orm';

export type HandoffMetadataFilters = {
  assignment?: 'all' | 'unassigned';
  attention?: 'all' | 'needs_follow_up';
  claimLink?: 'all' | 'linked' | 'unlinked';
  status?: 'all' | 'open' | 'accepted' | 'closed';
  urgency?: 'all' | 'critical' | 'high' | 'normal' | 'low';
  search?: string;
};

/** Independent BM admission: never accept a caller-supplied tenant, branch or role. */
export function handoffMetadataScope(
  authority: TenantAuthority,
  filters: HandoffMetadataFilters,
  handoffId?: string
) {
  const { tenantId, accessTenantId, purpose, principal } = readTenantAuthority(authority);
  if (
    purpose !== 'session' ||
    tenantId !== accessTenantId ||
    !principal?.userId ||
    !principal.branchId ||
    !deniesClaimMessageContent(principal.role)
  )
    return null;
  const conditions: (SQL | undefined)[] = [
    eq(supportHandoffs.tenantId, tenantId),
    eq(supportHandoffs.branchId, principal.branchId),
  ];
  if (handoffId !== undefined) conditions.push(eq(supportHandoffs.id, handoffId));
  if (filters.assignment === 'unassigned') conditions.push(isNull(supportHandoffs.staffId));
  if (filters.claimLink === 'linked') conditions.push(isNotNull(supportHandoffs.claimId));
  if (filters.claimLink === 'unlinked') conditions.push(isNull(supportHandoffs.claimId));
  if (filters.urgency && filters.urgency !== 'all')
    conditions.push(eq(supportHandoffs.urgency, filters.urgency));
  if (filters.attention === 'needs_follow_up') {
    conditions.push(
      eq(supportHandoffs.status, 'accepted'),
      gt(supportHandoffs.publicResponseVersion, 0),
      isNotNull(supportHandoffs.memberReplyAt),
      eq(supportHandoffs.memberReplyResponseVersion, supportHandoffs.publicResponseVersion)
    );
  } else if (filters.status && filters.status !== 'all') {
    conditions.push(eq(supportHandoffs.status, filters.status));
  }
  const search = filters.search?.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (search) {
    // Literal metadata search only: no subject, message, response, reason or claim narrative.
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(
      or(
        ilike(supportHandoffs.id, pattern),
        ilike(user.name, pattern),
        ilike(branches.name, pattern)
      )
    );
  }
  return { tenantId, where: and(...conditions) };
}
