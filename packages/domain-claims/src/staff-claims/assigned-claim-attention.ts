import {
  and,
  claimCorrespondence,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  eq,
  inArray,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { not } from 'drizzle-orm';
import { hasCorrespondenceReply } from '../claims/correspondence-read';
import { claimLifecycleStatusNotIn } from '../claims/lifecycle-read-sql';
import type { ClaimsSession } from '../claims/types';

export type AssignedClaimAttention = {
  nextActor: 'staff' | 'member' | 'untracked';
  overdueFollowUpDueAt: string | null;
  /** Set when the earliest overdue date is a case or correspondence follow-up of the register. */
  overdueFollowUpSource?: 'case_register';
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

function recordOverdueFollowUp(
  item: AssignedClaimAttention,
  dueAt: Date,
  now: Date,
  source?: 'case_register'
): void {
  if (dueAt.getTime() >= now.getTime()) return;
  const savedDate = dueAt.toISOString();
  if (!item.overdueFollowUpDueAt || savedDate < item.overdueFollowUpDueAt) {
    item.overdueFollowUpDueAt = savedDate;
    item.overdueFollowUpSource = source;
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

function readCaseFollowUps(
  tx: TenantTransaction,
  tenantId: string,
  staffId: string,
  claimIds: readonly string[]
) {
  const unanswered = sql<Date | null>`(
    select min(${claimCorrespondence.followUpAt}) from ${claimCorrespondence}
    where ${and(
      eq(claimCorrespondence.tenantId, claims.tenantId),
      eq(claimCorrespondence.claimId, claims.id),
      eq(claimCorrespondence.direction, 'outbound'),
      not(hasCorrespondenceReply())
    )}
  )`.mapWith(claimCorrespondence.followUpAt);
  return tx
    .select({ claimId: claims.id, caseDueAt: claims.caseFollowUpAt, outboundDueAt: unanswered })
    .from(claims)
    .where(
      withTenant(
        tenantId,
        claims.tenantId,
        and(
          inArray(claims.id, claimIds),
          eq(claims.staffId, staffId),
          claimLifecycleStatusNotIn(['draft'])
        )
      )
    );
}

/** Only the assigned staff owner receives request progress for these claim IDs. */
export async function getAssignedStaffClaimAttention(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  claimIds: readonly string[],
  now = new Date()
): Promise<Record<string, AssignedClaimAttention>> {
  const actor = session?.user;
  if (actor?.role !== 'staff' || !authority) throw new Error('Staff access required');
  if (claimIds.length === 0) return {};
  const { tenantId } = readTenantAuthority(authority);
  const staffId = actor.id;

  return withTenantAuthority(authority, async tx => {
    const rows = await tx
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
      );
    const followUps = await readCaseFollowUps(tx, tenantId, staffId, claimIds);
    const attention = deriveAssignedClaimAttention(claimIds, rows, now);
    for (const row of followUps) {
      const item = attention[row.claimId];
      if (row.caseDueAt) recordOverdueFollowUp(item, row.caseDueAt, now, 'case_register');
      if (row.outboundDueAt) recordOverdueFollowUp(item, row.outboundDueAt, now, 'case_register');
    }
    return attention;
  });
}
