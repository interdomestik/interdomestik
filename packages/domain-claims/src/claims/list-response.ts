import type { ClaimItem, ClaimsScope } from './list';
import { resolveClaimLifecycleReadProjection } from './lifecycle-read-model';

type ClaimListRow = {
  id: string;
  title: string | null;
  status: string | null;
  caseLifecycleState: string | null;
  recoveryLifecycleState: string | null;
  createdAt: Date | null;
  companyName: string | null;
  claimAmount: string | null;
  currency: string | null;
  category: string | null;
  claimantName: string | null;
  claimantEmail: string | null;
  claimNumber: string | null;
};

export function mapClaimsToResponse(
  rows: ClaimListRow[],
  scope: ClaimsScope,
  isAgent: boolean,
  unreadCounts: Map<string, number>
): ClaimItem[] {
  const redactForAgent = scope === 'agent_queue' && isAgent;

  return rows.map(row => {
    const lifecycle = resolveClaimLifecycleReadProjection(row);

    return {
      id: row.id,
      title: redactForAgent ? null : row.title,
      status: lifecycle.status,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      companyName: redactForAgent ? null : row.companyName,
      claimAmount: redactForAgent ? null : row.claimAmount,
      currency: redactForAgent ? null : row.currency,
      category: redactForAgent ? null : row.category,
      claimantName: redactForAgent ? null : row.claimantName,
      claimantEmail: redactForAgent ? null : row.claimantEmail,
      claimNumber: row.claimNumber,
      unreadCount: scope === 'member' || redactForAgent ? 0 : unreadCounts.get(row.id) || 0,
    };
  });
}
