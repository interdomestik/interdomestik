import 'server-only';

import { claims, claimStageHistory } from '@interdomestik/database/schema';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, asc, eq } from 'drizzle-orm';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { RestrictedRead } from './get-claim-message-metadata';
import { branchManagerClaimScope } from './branch-manager-claim-scope';

export type NoteFreeStatusEntry = Readonly<{
  id: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  timestamp: Date | null;
  isPublic: boolean;
}>;

/** A separate projection: no note, author name/email, or arbitrary metadata enters the process. */
export async function getNoteFreeClaimTimeline(args: {
  claimId: string;
  authority: TenantAuthority;
  publicOnly?: boolean;
  excludeDraft?: boolean;
}): Promise<RestrictedRead<NoteFreeStatusEntry[]>> {
  try {
    const scope = branchManagerClaimScope(args.authority, args.claimId);
    if (!scope) return { kind: 'unavailable' };
    return await withTenantAuthority<RestrictedRead<NoteFreeStatusEntry[]>>(
      args.authority,
      async tx => {
        const [claim] = await tx
          .select({
            caseLifecycleState: claims.caseLifecycleState,
            recoveryLifecycleState: claims.recoveryLifecycleState,
          })
          .from(claims)
          .where(scope.where)
          .limit(1);
        if (!claim || (args.excludeDraft && claimStatusFromLifecycleFields(claim) === 'draft')) {
          return { kind: 'unavailable' };
        }
        const rows = await tx
          .select({
            id: claimStageHistory.id,
            fromStatus: claimStageHistory.fromStatus,
            toStatus: claimStageHistory.toStatus,
            timestamp: claimStageHistory.createdAt,
            isPublic: claimStageHistory.isPublic,
          })
          .from(claimStageHistory)
          .where(
            and(
              eq(claimStageHistory.tenantId, scope.tenantId),
              eq(claimStageHistory.claimId, args.claimId),
              args.publicOnly ? eq(claimStageHistory.isPublic, true) : undefined
            )
          )
          .orderBy(asc(claimStageHistory.createdAt), asc(claimStageHistory.id));
        return {
          kind: 'ok',
          data: rows.map(row => ({
            id: row.id,
            fromStatus: row.fromStatus,
            toStatus: row.toStatus,
            timestamp: row.timestamp,
            isPublic: row.isPublic,
          })),
        };
      }
    );
  } catch {
    return { kind: 'failed' };
  }
}
