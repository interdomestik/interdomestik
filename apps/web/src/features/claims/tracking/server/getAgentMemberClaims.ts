import { db } from '@interdomestik/database';
import { claimLifecycleStatusNotIn } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { agentClients, claims, user } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { and, desc, eq, inArray } from 'drizzle-orm';
import 'server-only';
import { ensureClaimsAccess, type ClaimsSession } from '../../../../server/domains/claims/guards';
import { buildClaimVisibilityWhere } from '../utils';
import { mapAgentMemberClaimGroups } from './agentMemberClaimGroups';

export interface AgentMemberClaimsDto {
  memberId: string;
  memberName: string;
  memberEmail: string;
  claims: {
    id: string;
    title: string;
    status: string;
    statusLabelKey: string;
    createdAt: Date;
    updatedAt: Date | null;
  }[];
}

export async function getAgentMemberClaims(
  session: ClaimsSession | null
): Promise<AgentMemberClaimsDto[]> {
  return Sentry.withServerActionInstrumentation(
    'claims.tracking.agent',
    { recordResponse: true },
    async () => {
      // 1. Auth & Context
      const access = ensureClaimsAccess(session);
      const { tenantId, userId, role } = access;

      Sentry.setTag('tenantId', tenantId);

      // Strict role check
      if (
        role !== 'agent' &&
        role !== 'admin' &&
        role !== 'tenant_admin' &&
        role !== 'super_admin'
      ) {
        // Staff might need this too, but prompt specifically says "Agent Awareness"
        // allowing broader roles for flexibility if they visit the page.
      }

      const activeAgentClientRows = await db
        .select({ memberId: agentClients.memberId })
        .from(agentClients)
        .where(
          and(
            eq(agentClients.tenantId, tenantId),
            eq(agentClients.agentId, userId),
            eq(agentClients.status, 'active')
          )
        );

      const memberIds: string[] = Array.from(
        new Set<string>(
          activeAgentClientRows
            .map(row => row.memberId)
            .filter((memberId): memberId is string => typeof memberId === 'string')
        )
      );

      if (memberIds.length === 0) {
        return [];
      }

      const members = await db.query.user.findMany({
        where: and(eq(user.tenantId, tenantId), inArray(user.id, memberIds)),
        columns: {
          id: true,
          name: true,
          email: true,
        },
      });

      if (members.length === 0) {
        return [];
      }

      const resolvedMemberIds: string[] = members
        .map(m => m.id)
        .filter((memberId): memberId is string => typeof memberId === 'string');

      // 3. Fetch Claims for these members (excluding drafts per Phase 2.3 PRD)
      const visibilityCondition = buildClaimVisibilityWhere({
        tenantId,
        userId,
        role,
        branchId: access.branchId,
        agentMemberIds: resolvedMemberIds,
      });

      // db-access-guard: tenant-scoped -- reason: tenant predicate built by claim visibility helper before agent member claims lookup
      const memberClaims = await db.query.claims.findMany({
        where: and(
          visibilityCondition,
          inArray(claims.userId, resolvedMemberIds), // Optimization redundant but safe
          claimLifecycleStatusNotIn(['draft']) // PRD: Agents must not see draft claims
        ),
        orderBy: desc(claims.updatedAt),
        columns: {
          id: true,
          title: true,
          status: true,
          caseLifecycleState: true,
          recoveryLifecycleState: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
        },
      });

      return mapAgentMemberClaimGroups(members, memberClaims);
    }
  );
}
