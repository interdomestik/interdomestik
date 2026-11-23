import { agentClients, and, eq, type TenantTransaction } from '@interdomestik/database';

/**
 * Whether the agent holds an active `agent_clients` row for this member in the tenant: the only
 * admission of an agent to a member's activities and notes. The member's referring agent
 * (`user.agentId`) is no admission. The row is read FOR SHARE in the caller's transaction, so the
 * assignment the check saw cannot end before that transaction commits (R-17). Callers lock the
 * member row first, the order in which `updateUserAgentCore` writes the two rows.
 */
export async function holdsActiveAssignment(
  tx: TenantTransaction,
  assignment: { tenantId: string; agentId: string; memberId: string }
): Promise<boolean> {
  const rows = await tx
    .select({ id: agentClients.id })
    .from(agentClients)
    .where(
      and(
        eq(agentClients.tenantId, assignment.tenantId),
        eq(agentClients.agentId, assignment.agentId),
        eq(agentClients.memberId, assignment.memberId),
        eq(agentClients.status, 'active')
      )
    )
    .for('share');
  return rows.length > 0;
}
