import { db } from '@interdomestik/database';
import { agentClients } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

type AgentMemberAssignmentParams = {
  agentId: string;
  tenantId: string;
  memberId: string;
};

export async function isAgentAssignedToMember({
  agentId,
  tenantId,
  memberId,
}: AgentMemberAssignmentParams): Promise<boolean> {
  const assignment = await db.query.agentClients.findFirst({
    where: and(
      eq(agentClients.tenantId, tenantId),
      eq(agentClients.agentId, agentId),
      eq(agentClients.memberId, memberId)
    ),
    columns: { id: true },
  });

  return Boolean(assignment);
}
