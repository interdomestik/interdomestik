import { auditLog } from '@interdomestik/database/schema';
import { memberLeads } from '@interdomestik/database/schema/leads';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { LEAD_DUPLICATE_REFERRAL_ACTION } from '@/features/agent/leads/server/lead-duplicate-referral';
import type { ActionError, ActionSuccess } from '@/lib/safe-action';

import {
  DUPLICATE_RESOLUTION_OUTCOMES,
  LEAD_DUPLICATE_RESOLUTION_ENTITY,
  LEAD_DUPLICATE_RESOLVED_ACTION,
  REFERRAL_ENTITY_TYPE,
  type DuplicateResolutionOutcome,
} from './duplicate-resolution-constants';
import {
  isReferralInScope,
  resolveDuplicateReviewScope,
  type DuplicateReviewContext,
} from './review-scope';

export const resolveDuplicateSchema = z.object({
  referralId: z.string().trim().min(1).max(80),
  outcome: z.enum(DUPLICATE_RESOLUTION_OUTCOMES),
});

export type ResolveDuplicateResult =
  | ActionSuccess<{
      referralId: string;
      outcome: DuplicateResolutionOutcome;
      alreadyResolved: boolean;
    }>
  | ActionError;

export type ResolveDuplicateContext = DuplicateReviewContext & {
  authority: TenantAuthority;
  actorId: string;
};

function refuse(code: string, error: string): ActionError {
  return { success: false, error, code };
}

const NOT_FOUND = (): ActionError => refuse('NOT_FOUND', 'Duplicate referral not found.');

/** One resolution per referral: a retry or a double click maps to the same row. */
export function duplicateResolutionId(tenantId: string, referralId: string): string {
  const digest = createHash('sha256').update([tenantId, referralId].join('\u0000')).digest('hex');
  return `lead-dup-res-${digest.slice(0, 40)}`;
}

/**
 * Resolves a possible-duplicate referral (IDA-CRM-003) with an append-only audit row; the
 * referral itself is never updated. Out-of-scope and missing referrals get the same not-found
 * answer. Repeating the stored outcome succeeds; a different outcome is refused.
 */
export async function resolveDuplicateReferralCore(
  ctx: ResolveDuplicateContext,
  input: unknown
): Promise<ResolveDuplicateResult> {
  const parsed = resolveDuplicateSchema.safeParse(input);
  if (!parsed.success) return refuse('INVALID_PAYLOAD', 'Validation failed');
  const { referralId, outcome } = parsed.data;

  const scope = resolveDuplicateReviewScope(ctx);
  if (scope.kind === 'none') return NOT_FOUND();
  const { tenantId } = readTenantAuthority(ctx.authority);

  // db-access-guard: tenant-scoped -- reason: tenantId from the authority scopes this read and write
  return withTenantAuthority(ctx.authority, async tx => {
    const [referral] = await tx
      .select({
        submittingBranchId: sql<string | null>`${auditLog.metadata}->>'submittingBranchId'`,
        leadBranchId: memberLeads.branchId,
      })
      .from(auditLog)
      .leftJoin(
        memberLeads,
        and(eq(memberLeads.id, auditLog.entityId), eq(memberLeads.tenantId, tenantId))
      )
      .where(
        and(
          eq(auditLog.id, referralId),
          eq(auditLog.tenantId, tenantId),
          eq(auditLog.action, LEAD_DUPLICATE_REFERRAL_ACTION),
          eq(auditLog.entityType, REFERRAL_ENTITY_TYPE)
        )
      )
      .limit(1);
    if (!referral || !isReferralInScope(scope, referral)) return NOT_FOUND();

    const id = duplicateResolutionId(tenantId, referralId);
    const inserted = await tx
      .insert(auditLog)
      .values({
        id,
        tenantId,
        actorId: ctx.actorId,
        actorRole: ctx.userRole,
        action: LEAD_DUPLICATE_RESOLVED_ACTION,
        entityType: LEAD_DUPLICATE_RESOLUTION_ENTITY,
        entityId: referralId,
        metadata: { outcome },
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: auditLog.id });
    if (inserted.length > 0) {
      return { success: true, data: { referralId, outcome, alreadyResolved: false } };
    }

    const [stored] = await tx
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.id, id),
          eq(auditLog.tenantId, tenantId),
          eq(auditLog.action, LEAD_DUPLICATE_RESOLVED_ACTION),
          eq(auditLog.entityType, LEAD_DUPLICATE_RESOLUTION_ENTITY),
          eq(auditLog.entityId, referralId)
        )
      )
      .limit(1);
    if ((stored?.metadata as { outcome?: unknown } | undefined)?.outcome !== outcome) {
      return refuse('ALREADY_RESOLVED', 'This referral was already resolved differently.');
    }
    return { success: true, data: { referralId, outcome, alreadyResolved: true } };
  });
}
