import 'server-only';

import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { claimMessages, claims, user } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, count, desc, eq, max, sql } from 'drizzle-orm';
import {
  isFullTenantClaimsRole,
  isScopedClaimsReadRole,
} from '../../../../../../packages/domain-communications/src/messages/access';
import { branchManagerClaimScope } from './branch-manager-claim-scope';

export type ClaimMessageMetadata = Readonly<{
  count: number;
  lastMessageAt: string | null;
  awaitingReply: boolean;
}>;
export type RestrictedRead<T> =
  { kind: 'ok'; data: T } | { kind: 'unavailable' } | { kind: 'failed' };

export async function getClaimMessageMetadata(args: {
  claimId: string;
  authority: TenantAuthority;
}): Promise<RestrictedRead<ClaimMessageMetadata>> {
  try {
    const scope = branchManagerClaimScope(args.authority, args.claimId);
    if (!scope) return { kind: 'unavailable' };
    return await withTenantAuthority<RestrictedRead<ClaimMessageMetadata>>(
      args.authority,
      async tx => {
        const [claim] = await tx
          .select({ memberId: claims.userId })
          .from(claims)
          .where(scope.where)
          .limit(1);
        if (!claim) return { kind: 'unavailable' };
        const where = and(
          eq(claimMessages.tenantId, scope.tenantId),
          eq(claimMessages.claimId, args.claimId)
        );
        // Total count and timestamp include internal and legacy messages. No text is selected.
        const [totals] = await tx
          .select({
            count: count(),
            lastMessageAt: max(claimMessages.createdAt),
          })
          .from(claimMessages)
          .where(where);
        const publicMessages = await tx
          .select({
            senderId: claimMessages.senderId,
            senderRole: user.role,
            createdAt: claimMessages.createdAt,
          })
          .from(claimMessages)
          .leftJoin(
            user,
            and(eq(user.id, claimMessages.senderId), eq(user.tenantId, scope.tenantId))
          )
          .where(and(where, eq(claimMessages.isInternal, false)))
          .orderBy(sql`${claimMessages.createdAt} desc nulls last`, desc(claimMessages.id));
        // Ignore agent/other senders. Match the staff-side reply admission in domain send/notify;
        // scoped readers include BM, whose communication-content veto excludes it from replies.
        const isStaffReply = (role: string | null): boolean =>
          isFullTenantClaimsRole(role) ||
          (isScopedClaimsReadRole(role) && !deniesClaimMessageContent(role));
        const dated = publicMessages.filter(message => message.createdAt);
        const latestMember = dated.find(message => message.senderId === claim.memberId);
        const latestStaff = dated.find(
          message => message.senderId !== claim.memberId && isStaffReply(message.senderRole)
        );
        // Only a strictly later staff reply answers the member; equal timestamps stay awaiting.
        const awaitingReply =
          latestMember?.createdAt != null &&
          !(
            latestStaff?.createdAt != null &&
            new Date(latestStaff.createdAt).getTime() > new Date(latestMember.createdAt).getTime()
          );
        return {
          kind: 'ok',
          data: {
            count: totals?.count ?? 0,
            lastMessageAt: totals?.lastMessageAt
              ? new Date(totals.lastMessageAt).toISOString()
              : null,
            // Undated legacy rows cannot establish a latest public member request.
            awaitingReply,
          },
        };
      }
    );
  } catch {
    return { kind: 'failed' };
  }
}
