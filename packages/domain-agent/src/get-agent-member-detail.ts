import { agentClients, and, claims, db, desc, eq } from '@interdomestik/database';

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

export type AgentMemberDetail = {
  member: {
    id: string;
    fullName: string;
    membershipNumber: string;
    status?: string;
  };
  recentClaims: Array<{
    id: string;
    claimNumber: string;
    status: ClaimStatus;
    stageLabel: string;
    updatedAt: string;
  }>;
};

function formatStageLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getAgentMemberDetail(params: {
  agentId: string;
  tenantId: string;
  memberId: string;
}): Promise<AgentMemberDetail | null> {
  const { agentId, tenantId, memberId } = params;

  const assignment = await db.query.agentClients.findFirst({
    where: and(
      eq(agentClients.tenantId, tenantId),
      eq(agentClients.agentId, agentId),
      eq(agentClients.memberId, memberId)
    ),
    columns: { id: true },
    with: {
      member: {
        columns: { id: true, name: true, memberNumber: true },
      },
    },
  });

  if (!assignment?.member) {
    return null;
  }

  const rawClaims = await db.query.claims.findMany({
    where: and(eq(claims.tenantId, tenantId), eq(claims.userId, memberId)),
    orderBy: [desc(claims.updatedAt)],
    limit: 5,
    columns: {
      id: true,
      claimNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const recentClaims = rawClaims.map(claim => {
    const status = (claim.status || 'draft') as ClaimStatus;
    const updatedAt = normalizeDate(claim.updatedAt ?? claim.createdAt) ?? new Date().toISOString();
    return {
      id: claim.id,
      claimNumber: claim.claimNumber ?? '—',
      status,
      stageLabel: formatStageLabel(status),
      updatedAt,
    };
  });

  return {
    member: {
      id: assignment.member.id,
      fullName: assignment.member.name,
      membershipNumber: assignment.member.memberNumber ?? '—',
    },
    recentClaims,
  };
}
