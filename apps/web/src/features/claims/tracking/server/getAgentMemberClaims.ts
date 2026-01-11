import { db } from '@interdomestik/database';
import { claims, user } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { and, desc, eq, inArray } from 'drizzle-orm';
import 'server-only';
import { ensureClaimsAccess } from '../../../../server/domains/claims/guards';
import { buildClaimVisibilityWhere } from '../utils';

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

export async function getAgentMemberClaims(session: any): Promise<AgentMemberClaimsDto[]> {
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

      // 2. Fetch Members assigned to this agent
      // We need to know which members this agent manages.
      // Logic: User.agentId == session.userId

      const members = await db.query.user.findMany({
        where: and(eq(user.tenantId, tenantId), eq(user.agentId, userId)),
        columns: {
          id: true,
          name: true,
          email: true,
        },
      });

      if (members.length === 0) {
        return [];
      }

      const memberIds = members.map(m => m.id);

      // 3. Fetch Claims for these members
      // We use the visibility helper to be safe, but we can also be explicit here since we have the list.
      const visibilityCondition = buildClaimVisibilityWhere({
        tenantId,
        userId,
        role,
        branchId: access.branchId,
        agentMemberIds: memberIds,
      });

      const memberClaims = await db.query.claims.findMany({
        where: and(
          visibilityCondition,
          inArray(claims.userId, memberIds) // Optimization redundant but safe
        ),
        orderBy: desc(claims.updatedAt),
        columns: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
        },
      });

      // 4. Group by Member
      const result: AgentMemberClaimsDto[] = members
        .map(member => {
          const theirClaims = memberClaims
            .filter(c => c.userId === member.id)
            .map(c => ({
              id: c.id,
              title: c.title,
              status: c.status || 'draft',
              statusLabelKey: `claims.status.${c.status || 'draft'}`,
              createdAt: c.createdAt ?? new Date(),
              updatedAt: c.updatedAt,
            }));

          return {
            memberId: member.id,
            memberName: member.name,
            memberEmail: member.email,
            claims: theirClaims,
          };
        })
        .filter(group => group.claims.length > 0); // Optional: only show members with claims? Prompt says "Shows list of claims for members..." often implies all members.
      // "grouped by member" -> let's keep all members even if empty?
      // "Agent must always see current status of their members’ claims."
      // Let's filter out empty for cleanliness unless requested.

      return result;
    }
  );
}
