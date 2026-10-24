import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';

export interface AgentProClaimDTO {
  id: string;
  title: string;
  claimNumber: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  member: {
    id: string;
    name: string;
    email: string;
  } | null;
  branch: {
    name: string;
  } | null;
  unreadCount: number;
  lastMessage: string | null;
  policy: null;
}

export type ClaimRow = {
  id: string;
  title: string | null;
  claimNumber: string | null;
  caseLifecycleState: string | null;
  recoveryLifecycleState: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  user?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  branch?: {
    name: string | null;
  } | null;
};

function normalizeClaimDate(value: Date | string | null): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

export function mapToAgentProClaim(c: ClaimRow): AgentProClaimDTO {
  return {
    id: c.id,
    title: c.title ?? 'Untitled',
    claimNumber: c.claimNumber ?? 'N/A',
    status: claimStatusFromLifecycleFields(c),
    createdAt: normalizeClaimDate(c.createdAt),
    updatedAt: normalizeClaimDate(c.updatedAt),
    member: c.user
      ? {
          id: c.user.id,
          name: c.user.name ?? '',
          email: c.user.email,
        }
      : null,
    branch: c.branch
      ? {
          name: c.branch.name ?? 'N/A',
        }
      : null,
    unreadCount: 0,
    lastMessage: null,
    policy: null,
  };
}

export function dedupeClaimsById(claims: AgentProClaimDTO[]): AgentProClaimDTO[] {
  const seen = new Set<string>();
  return claims.filter(claim => {
    if (seen.has(claim.id)) return false;
    seen.add(claim.id);
    return true;
  });
}
