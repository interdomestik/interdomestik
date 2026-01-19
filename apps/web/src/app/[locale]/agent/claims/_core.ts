import { claims, user } from '@interdomestik/database/schema';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

export interface AgentMemberClaimsDTO {
  memberId: string;
  memberName: string;
  memberEmail: string;
  claims: {
    id: string;
    title: string;
    status: string;
    statusLabelKey: string;
    createdAt: string;
    updatedAt: string | null;
  }[];
}

export type AgentClaimsResult =
  | { ok: true; data: AgentMemberClaimsDTO[] }
  | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INTERNAL' };

/**
 * Pure core logic for the Agent Claims Page.
 * Fetches members managed by the agent and their claims, grouped by member.
 */
export async function getAgentClaimsCore(params: {
  tenantId: string;
  userId: string;
  role: string;
  branchId?: string | null;
  db: any;
}): Promise<AgentClaimsResult> {
  const { tenantId, userId, role, db } = params;

  // 1. Role Gating
  const allowedRoles = ['agent', 'admin', 'tenant_admin', 'super_admin'];
  if (!allowedRoles.includes(role)) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  try {
    // 2. Fetch Members assigned to this agent
    const members = await db.query.user.findMany({
      where: and(eq(user.tenantId, tenantId), eq(user.agentId, userId)),
      columns: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (members.length === 0) {
      return { ok: true, data: [] };
    }

    const memberIds = members.map((m: Record<string, unknown>) => m.id as string);

    // 3. Fetch Claims for these members (excluding drafts)
    // We use a simplified visibility logic here for the core.
    const memberClaims = await db.query.claims.findMany({
      where: and(
        eq(claims.tenantId, tenantId),
        inArray(claims.userId, memberIds),
        ne(claims.status, 'draft')
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
    const result: AgentMemberClaimsDTO[] = members
      .map((member: Record<string, unknown>) => {
        const theirClaims = memberClaims
          .filter((c: Record<string, unknown>) => (c.userId as string) === (member.id as string))
          .map((c: Record<string, unknown>) => ({
            id: c.id as string,
            title: c.title as string,
            status: (c.status as string) || 'draft',
            statusLabelKey: `claims-tracking.status.${(c.status as string) || 'draft'}`,
            createdAt:
              c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
            updatedAt:
              c.updatedAt instanceof Date
                ? c.updatedAt.toISOString()
                : c.updatedAt
                  ? String(c.updatedAt)
                  : null,
          }));

        return {
          memberId: member.id as string,
          memberName: (member.name as string) || 'Unknown',
          memberEmail: (member.email as string) || 'No email',
          claims: theirClaims,
        };
      })
      .filter((group: AgentMemberClaimsDTO) => group.claims.length > 0);

    return { ok: true, data: result };
  } catch (error) {
    console.error('[AgentClaimsCore] Error assembling dashboard:', error);
    return { ok: false, code: 'INTERNAL' };
  }
}
