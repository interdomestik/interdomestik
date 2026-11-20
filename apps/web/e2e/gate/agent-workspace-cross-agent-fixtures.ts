import { agentClients, claimMessages, claims, db, user } from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { and, desc, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const SUBMITTED_LIFECYCLE = claimLifecycleFieldsForStatus('submitted');

type CrossAgentClaimResult = {
  claimId: string;
  assignmentId: string | null;
  memberId: string | null;
  otherAgentId: string | null;
  createdClaim: boolean;
  createdAssignment: boolean;
  createdMember: boolean;
  createdOtherAgent: boolean;
};
export async function resolveCrossAgentClaimId(agentEmail: string): Promise<CrossAgentClaimResult> {
  const seededAgent = await db.query.user.findFirst({
    where: eq(user.email, agentEmail),
    columns: { id: true, tenantId: true, branchId: true },
  });

  if (!seededAgent?.tenantId || !seededAgent.id) {
    throw new Error(`Expected seeded agent with tenant context for ${agentEmail}`);
  }

  const currentAssignments = await db.query.agentClients.findMany({
    where: and(
      eq(agentClients.tenantId, seededAgent.tenantId),
      eq(agentClients.agentId, seededAgent.id),
      eq(agentClients.status, 'active')
    ),
    columns: { memberId: true },
  });

  const currentMemberIds = new Set(currentAssignments.map(assignment => assignment.memberId));
  const existingSameBranchPeerClaims = await db.query.claims.findMany({
    where: and(
      eq(claims.tenantId, seededAgent.tenantId),
      eq(claims.caseLifecycleState, SUBMITTED_LIFECYCLE.caseLifecycleState),
      eq(claims.recoveryLifecycleState, SUBMITTED_LIFECYCLE.recoveryLifecycleState),
      ...(seededAgent.branchId ? [eq(claims.branchId, seededAgent.branchId)] : [])
    ),
    columns: { id: true, userId: true, agentId: true },
    orderBy: [desc(claims.createdAt)],
  });

  const existingPeerClaim = existingSameBranchPeerClaims.find(
    claim =>
      Boolean(claim.agentId) &&
      claim.agentId !== seededAgent.id &&
      !currentMemberIds.has(claim.userId)
  );

  if (existingPeerClaim?.id) {
    return {
      claimId: existingPeerClaim.id,
      assignmentId: null,
      memberId: null,
      otherAgentId: null,
      createdClaim: false,
      createdAssignment: false,
      createdMember: false,
      createdOtherAgent: false,
    };
  }

  const now = new Date();
  const suffix = randomUUID();
  const otherAgentIdBase = `e2e-d02-agent-${suffix}`;

  const existingOtherAgent = await db.query.user.findFirst({
    where: and(
      eq(user.tenantId, seededAgent.tenantId),
      eq(user.role, 'agent'),
      ne(user.id, seededAgent.id),
      ...(seededAgent.branchId ? [eq(user.branchId, seededAgent.branchId)] : [])
    ),
    columns: { id: true },
  });

  let otherAgentId = existingOtherAgent?.id ?? null;
  let createdOtherAgent = false;

  if (!otherAgentId) {
    otherAgentId = otherAgentIdBase;
    await db.insert(user).values({
      id: otherAgentId,
      tenantId: seededAgent.tenantId,
      name: `D02 Peer Agent ${suffix.slice(0, 8)}`,
      email: `${otherAgentId}@example.com`,
      emailVerified: true,
      role: 'agent',
      branchId: seededAgent.branchId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    createdOtherAgent = true;
  }

  const memberId = `e2e-d02-member-${suffix}`;
  await db.insert(user).values({
    id: memberId,
    tenantId: seededAgent.tenantId,
    name: `D02 Peer Member ${suffix.slice(0, 8)}`,
    email: `${memberId}@example.com`,
    emailVerified: true,
    role: 'member',
    branchId: seededAgent.branchId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const assignmentId = `e2e-d02-assignment-${suffix}`;
  await db.insert(agentClients).values({
    id: assignmentId,
    tenantId: seededAgent.tenantId,
    agentId: otherAgentId,
    memberId,
    status: 'active',
  });

  const claimId = `e2e-d02-claim-${suffix}`;
  await db.insert(claims).values({
    id: claimId,
    tenantId: seededAgent.tenantId,
    userId: memberId,
    agentId: otherAgentId,
    branchId: seededAgent.branchId ?? null,
    title: `D02 cross-agent claim ${suffix}`,
    companyName: 'Interdomestik QA',
    category: 'vehicle',
    ...claimLifecycleFieldsForStatus('submitted'),
  });

  return {
    claimId,
    assignmentId,
    memberId,
    otherAgentId,
    createdClaim: true,
    createdAssignment: true,
    createdMember: true,
    createdOtherAgent,
  };
}

export async function cleanupCrossAgentClaim(result: CrossAgentClaimResult): Promise<void> {
  try {
    if (result.createdClaim) {
      await db.delete(claimMessages).where(eq(claimMessages.claimId, result.claimId));
      await db.delete(claims).where(eq(claims.id, result.claimId));
    }

    if (result.createdAssignment && result.assignmentId) {
      await db.delete(agentClients).where(eq(agentClients.id, result.assignmentId));
    }

    if (result.createdMember && result.memberId) {
      await db.delete(user).where(eq(user.id, result.memberId));
    }

    if (result.createdOtherAgent && result.otherAgentId) {
      await db.delete(user).where(eq(user.id, result.otherAgentId));
    }
  } catch (error) {
    console.warn(
      `[agent-workspace-e2e] Failed to cleanup cross-agent claim ${result.claimId}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
