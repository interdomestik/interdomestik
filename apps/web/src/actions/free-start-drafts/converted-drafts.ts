import 'server-only';

import { savedDraftClaimId } from '@/actions/claims/saved-draft-claim-identity';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { claims } from '@interdomestik/database';
import type { FreeStartDraftContext } from '@interdomestik/database/free-start-drafts';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq, inArray } from 'drizzle-orm';

export async function findConvertedDrafts(
  context: FreeStartDraftContext,
  draftIds: readonly string[],
  requestHeaders: Headers
): Promise<ReadonlySet<string>> {
  if (draftIds.length === 0) return new Set();
  const authorized = await authorizeSessionTenant(requestHeaders);
  if (!authorized) throw new Error('Draft account unavailable');
  const { tenantId, principal } = readTenantAuthority(authorized.authority);
  if (
    tenantId !== context.tenantId ||
    tenantId !== context.accessTenantId ||
    principal?.userId !== context.ownerUserId
  ) {
    throw new Error('Draft account changed');
  }
  const claimIds = draftIds.map(id => savedDraftClaimId(tenantId, context.ownerUserId, id));
  const rows = await withTenantAuthority(authorized.authority, tx =>
    tx
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, tenantId),
          eq(claims.userId, context.ownerUserId),
          inArray(claims.id, claimIds)
        )
      )
  );
  // Any converted row excludes restoration, even a legacy claim without a valid number.
  const existing = new Set(rows.map(row => row.id));
  return new Set(draftIds.filter((_, index) => existing.has(claimIds[index]!)));
}
