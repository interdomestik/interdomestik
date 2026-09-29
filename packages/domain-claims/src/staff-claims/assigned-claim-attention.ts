import {
  and,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  eq,
  inArray,
  withTenantContext,
} from '@interdomestik/database';
import type { ClaimsSession } from '../claims/types';

export type AssignedClaimAttention = {
  nextActor: 'staff' | 'member' | 'untracked';
  overdueFollowUpDueAt: string | null;
};

type RequestProgressRow = {
  claimId: string;
  requestId: string;
  dueAt: Date;
  submittedAt: Date | null;
};

type RequestProgress = { claimId: string; dueAt: Date; hasEvidence: boolean };

function groupRequestProgress(rows: readonly RequestProgressRow[]): Map<string, RequestProgress> {
  const requests = new Map<string, RequestProgress>();
  for (const row of rows) {
    const request = requests.get(row.requestId) ?? {
      claimId: row.claimId,
      dueAt: row.dueAt,
      hasEvidence: false,
    };
    if (row.submittedAt) request.hasEvidence = true;
    requests.set(row.requestId, request);
  }
  return requests;
}

function recordOverdueFollowUp(item: AssignedClaimAttention, dueAt: Date, now: Date): void {
  if (dueAt.getTime() >= now.getTime()) return;
  const savedDate = dueAt.toISOString();
  if (!item.overdueFollowUpDueAt || savedDate < item.overdueFollowUpDueAt) {
    item.overdueFollowUpDueAt = savedDate;
  }
}

/** A saved request date prompts an operational follow-up, never a legal or case-SLA breach. */
export function deriveAssignedClaimAttention(
  claimIds: readonly string[],
  rows: readonly RequestProgressRow[],
  now: Date
): Record<string, AssignedClaimAttention> {
  const byClaim: Record<string, AssignedClaimAttention> = Object.fromEntries(
    claimIds.map(id => [id, { nextActor: 'untracked', overdueFollowUpDueAt: null }])
  );
  const requests = groupRequestProgress(rows);

  const hasStaffRequest = new Set<string>();
  const hasMemberRequest = new Set<string>();
  for (const request of requests.values()) {
    const item = byClaim[request.claimId];
    if (!item) continue;
    if (request.hasEvidence) {
      hasStaffRequest.add(request.claimId);
      continue;
    }
    hasMemberRequest.add(request.claimId);
    recordOverdueFollowUp(item, request.dueAt, now);
  }

  for (const claimId of hasMemberRequest) {
    if (!hasStaffRequest.has(claimId)) byClaim[claimId].nextActor = 'member';
  }
  for (const claimId of hasStaffRequest) byClaim[claimId].nextActor = 'staff';
  return byClaim;
}

/** Only the assigned staff owner receives request progress for these claim IDs. */
export async function getAssignedStaffClaimAttention(
  session: ClaimsSession | null,
  claimIds: readonly string[],
  now = new Date()
): Promise<Record<string, AssignedClaimAttention>> {
  const actor = session?.user;
  if (actor?.role !== 'staff' || !actor.tenantId) throw new Error('Staff access required');
  if (claimIds.length === 0) return {};
  const tenantId = actor.tenantId;
  const staffId = actor.id;

  const rows = await withTenantContext({ tenantId, role: 'staff' }, async tx =>
    tx
      .select({
        claimId: claimInformationRequests.claimId,
        requestId: claimInformationRequests.id,
        dueAt: claimInformationRequests.dueAt,
        submittedAt: claimInformationRequestEvidence.submittedAt,
      })
      .from(claimInformationRequests)
      .innerJoin(
        claims,
        and(
          eq(claims.id, claimInformationRequests.claimId),
          eq(claims.tenantId, claimInformationRequests.tenantId)
        )
      )
      .leftJoin(
        claimInformationRequestEvidence,
        and(
          eq(claimInformationRequestEvidence.tenantId, claimInformationRequests.tenantId),
          eq(claimInformationRequestEvidence.claimId, claimInformationRequests.claimId),
          eq(claimInformationRequestEvidence.requestId, claimInformationRequests.id)
        )
      )
      .where(
        and(
          eq(claimInformationRequests.tenantId, tenantId),
          inArray(claimInformationRequests.claimId, [...claimIds]),
          eq(claimInformationRequests.status, 'open'),
          eq(claims.staffId, staffId)
        )
      )
  );

  return deriveAssignedClaimAttention(claimIds, rows, now);
}
