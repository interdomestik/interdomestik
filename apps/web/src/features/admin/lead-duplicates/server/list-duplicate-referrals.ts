import { auditLog, branches, user } from '@interdomestik/database/schema';
import { memberLeads } from '@interdomestik/database/schema/leads';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { LEAD_DUPLICATE_REFERRAL_ACTION } from '@/features/agent/leads/server/lead-duplicate-referral';

import {
  LEAD_DUPLICATE_RESOLUTION_ENTITY,
  LEAD_DUPLICATE_RESOLVED_ACTION,
  REFERRAL_ENTITY_TYPE,
  type DuplicateResolutionOutcome,
} from './duplicate-resolution-constants';
import { resolveDuplicateReviewScope, type DuplicateReviewContext } from './review-scope';

export type DuplicateReviewState = 'pending' | 'resolved';

export type DuplicateReferralRow = {
  referralId: string;
  referredAt: Date | null;
  submittingAgentName: string | null;
  submittingBranchName: string | null;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    branchName: string | null;
    ownerName: string | null;
  } | null;
  resolution: {
    outcome: DuplicateResolutionOutcome;
    resolvedAt: Date | null;
    resolverName: string | null;
  } | null;
};

/** Pending is a drainable FIFO queue; resolved shows the most recent closures. */
const LIMITS: Record<DuplicateReviewState, number> = { pending: 100, resolved: 50 };

/**
 * Lists possible-duplicate referrals for review (IDA-CRM-003). Only the existing lead is shown,
 * never submitted content (none is stored). A branch manager sees only referrals whose submitting
 * branch and existing lead's current branch are both the manager's own, so a referral without a
 * lead is visible to tenant reviewers only. Every joined row is scoped to the session tenant.
 */
export async function listDuplicateReferrals(
  ctx: DuplicateReviewContext & { authority: TenantAuthority },
  state: DuplicateReviewState = 'pending'
): Promise<DuplicateReferralRow[]> {
  const scope = resolveDuplicateReviewScope(ctx);
  if (scope.kind === 'none') return [];
  const { tenantId } = readTenantAuthority(ctx.authority);

  // db-access-guard: tenant-scoped -- reason: tenantId from the authority scopes every joined row
  const rows = await withTenantAuthority(ctx.authority, async tx => {
    const resolution = alias(auditLog, 'resolution');
    const submitter = alias(user, 'submitter');
    const owner = alias(user, 'lead_owner');
    const resolver = alias(user, 'resolver');
    const submittingBranch = alias(branches, 'submitting_branch');
    const leadBranch = alias(branches, 'lead_branch');
    const branchId = scope.kind === 'branch' ? scope.branchId : null;

    return await tx
      .select({
        referralId: auditLog.id,
        referredAt: auditLog.createdAt,
        submittingAgentName: submitter.name,
        submittingBranchName: submittingBranch.name,
        leadId: memberLeads.id,
        leadFirstName: memberLeads.firstName,
        leadLastName: memberLeads.lastName,
        leadEmail: memberLeads.email,
        leadStatus: memberLeads.status,
        leadBranchName: leadBranch.name,
        ownerName: owner.name,
        resolutionMetadata: resolution.metadata,
        resolvedAt: resolution.createdAt,
        resolverName: resolver.name,
      })
      .from(auditLog)
      .leftJoin(
        memberLeads,
        and(eq(memberLeads.id, auditLog.entityId), eq(memberLeads.tenantId, tenantId))
      )
      .leftJoin(
        resolution,
        and(
          eq(resolution.entityId, auditLog.id),
          eq(resolution.tenantId, tenantId),
          eq(resolution.action, LEAD_DUPLICATE_RESOLVED_ACTION),
          eq(resolution.entityType, LEAD_DUPLICATE_RESOLUTION_ENTITY)
        )
      )
      .leftJoin(
        submitter,
        and(eq(submitter.id, auditLog.actorId), eq(submitter.tenantId, tenantId))
      )
      .leftJoin(owner, and(eq(owner.id, memberLeads.agentId), eq(owner.tenantId, tenantId)))
      .leftJoin(resolver, and(eq(resolver.id, resolution.actorId), eq(resolver.tenantId, tenantId)))
      .leftJoin(
        submittingBranch,
        and(
          eq(submittingBranch.id, sql<string>`${auditLog.metadata}->>'submittingBranchId'`),
          eq(submittingBranch.tenantId, tenantId)
        )
      )
      .leftJoin(
        leadBranch,
        and(eq(leadBranch.id, memberLeads.branchId), eq(leadBranch.tenantId, tenantId))
      )
      .where(
        and(
          eq(auditLog.tenantId, tenantId),
          eq(auditLog.action, LEAD_DUPLICATE_REFERRAL_ACTION),
          eq(auditLog.entityType, REFERRAL_ENTITY_TYPE),
          state === 'pending' ? isNull(resolution.id) : isNotNull(resolution.id),
          // A branch manager needs both the submitting and the lead's current branch.
          branchId === null
            ? undefined
            : sql`${auditLog.metadata}->>'submittingBranchId' = ${branchId}`,
          branchId === null ? undefined : eq(memberLeads.branchId, branchId)
        )
      )
      .orderBy(
        state === 'pending' ? asc(auditLog.createdAt) : desc(resolution.createdAt),
        asc(auditLog.id)
      )
      .limit(LIMITS[state]);
  });

  return rows.map(row => ({
    referralId: row.referralId,
    referredAt: row.referredAt,
    submittingAgentName: row.submittingAgentName,
    submittingBranchName: row.submittingBranchName,
    lead: row.leadId
      ? {
          id: row.leadId,
          firstName: row.leadFirstName ?? '',
          lastName: row.leadLastName ?? '',
          email: row.leadEmail ?? '',
          status: row.leadStatus ?? '',
          branchName: row.leadBranchName,
          ownerName: row.ownerName,
        }
      : null,
    resolution: row.resolutionMetadata
      ? {
          outcome: (row.resolutionMetadata as { outcome: DuplicateResolutionOutcome }).outcome,
          resolvedAt: row.resolvedAt,
          resolverName: row.resolverName,
        }
      : null,
  }));
}
