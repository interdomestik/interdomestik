import {
  and,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claimCaseFields,
  claims,
  eq,
  inArray,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { resolveRegisterQueueActor, type RegisterActor } from '../claims/case-register-access';
import { claimLifecycleStatusNotIn } from '../claims/lifecycle-read-sql';
import type { ClaimsSession } from '../claims/types';
import { resolveStaffClaimReader } from './reader-policy';
import { buildStaffClaimReadScope } from './scope';

export type AssignedClaimAttention = {
  nextActor: 'staff' | 'member' | 'untracked';
  overdueFollowUpDueAt: string | null;
  /** Set when the earliest overdue date is a case or correspondence follow-up of the register. */
  overdueFollowUpSource?: 'case_register';
};

type RequestProgressRow = {
  claimId: string;
  memberDueAt: Date | null;
  hasEvidence: boolean;
};

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
  for (const row of rows) {
    const item = byClaim[row.claimId];
    if (!item) continue;
    item.nextActor = row.hasEvidence ? 'staff' : 'member';
    if (row.memberDueAt) recordOverdueFollowUp(item, row.memberDueAt, now);
  }
  return byClaim;
}

/**
 * Register deadlines under the register admission (Astra code r1 B1): the assigned staff member,
 * the claim's branch when the actor has one, never a draft. The tenant setting of the transaction
 * and the claim's own RLS bind the rest.
 */
function readCaseFollowUps(
  tx: TenantTransaction,
  tenantId: string,
  actor: RegisterActor,
  claimIds: readonly string[]
) {
  return tx
    .select({
      claimId: claims.id,
      caseDueAt: claimCaseFields.caseFollowUpAt,
      // The earliest follow-up of an outbound entry that no inbound reply answers. Outer columns
      // are written qualified (Drizzle renders interpolated columns unqualified in a subquery).
      outboundDueAt: sql<Date | null>`(
        select min(outbound.follow_up_at) from "claim_correspondence" as outbound
        where outbound.tenant_id = "claim"."tenant_id"
          and outbound.claim_id = "claim"."id"
          and outbound.direction = 'outbound'
          and outbound.follow_up_at is not null
          and not exists (
            select 1 from "claim_correspondence" as correspondence_reply
            where correspondence_reply.tenant_id = outbound.tenant_id
              and correspondence_reply.claim_id = outbound.claim_id
              and correspondence_reply.in_reply_to_id = outbound.id
              and correspondence_reply.direction = 'inbound'
          )
      )`.mapWith((value: string | Date) => new Date(value)),
    })
    .from(claims)
    .leftJoin(
      claimCaseFields,
      and(eq(claimCaseFields.tenantId, claims.tenantId), eq(claimCaseFields.claimId, claims.id))
    )
    .where(
      withTenant(
        tenantId,
        claims.tenantId,
        and(
          inArray(claims.id, [...claimIds]),
          eq(claims.staffId, actor.userId),
          actor.branchId ? eq(claims.branchId, actor.branchId) : undefined,
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
  if (session?.user.role !== 'staff' || !authority) throw new Error('Staff access required');
  if (claimIds.length === 0) return {};
  const reader = resolveStaffClaimReader(authority);
  if (
    reader?.role !== 'staff' ||
    reader.staffId !== session.user.id ||
    reader.branchId !== (session.user.branchId?.trim() || null)
  ) {
    return deriveAssignedClaimAttention(claimIds, [], now);
  }
  const { tenantId, staffId, branchId, role } = reader;
  const register = resolveRegisterQueueActor(session, authority);

  return withTenantAuthority(authority, async tx => {
    const rows = await tx
      .select({
        claimId: claimInformationRequests.claimId,
        memberDueAt: sql<Date | null>`min(${claimInformationRequests.dueAt})
          filter (where ${claimInformationRequestEvidence.submittedAt} is null)`.mapWith(
          (value: string | Date) => new Date(value)
        ),
        hasEvidence: sql<boolean>`bool_or(${claimInformationRequestEvidence.submittedAt} is not null)`,
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
          eq(claimInformationRequests.status, 'open'),
          eq(claims.staffId, staffId),
          buildStaffClaimReadScope({ claimIds, userId: staffId, branchId, role })
        )
      )
      .groupBy(claimInformationRequests.claimId);
    const attention = deriveAssignedClaimAttention(claimIds, rows, now);
    const followUps = register
      ? await readCaseFollowUps(tx, register.tenantId, register.actor, claimIds)
      : [];
    for (const row of followUps) {
      const item = attention[row.claimId];
      if (row.caseDueAt) recordOverdueFollowUp(item, row.caseDueAt, now, 'case_register');
      if (row.outboundDueAt) recordOverdueFollowUp(item, row.outboundDueAt, now, 'case_register');
    }
    return attention;
  });
}
