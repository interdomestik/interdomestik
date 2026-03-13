import {
  claimEscalationAgreements,
  claimStageHistory,
  claims,
  db,
  eq,
  serviceUsage,
  subscriptions,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import type { ActionResult, ClaimStatus } from './types';

import { claimStatusSchema } from '../validators/claims';

const STAFF_LED_RECOVERY_STATUSES: ReadonlySet<ClaimStatus> = new Set(['negotiation', 'court']);
const FAMILY_MATTER_ALLOWANCE = 5;
const STANDARD_MATTER_ALLOWANCE = 2;
const RECOVERY_MATTER_SERVICE_CODE_PREFIX = 'staff_recovery_matter:';
const RECOVERY_ALLOWANCE_EXHAUSTED_ERROR =
  'Matter allowance is exhausted. Record an override reason or upgrade the membership before staff-led recovery can begin.';

function resolveMatterAllowance(params: {
  planId: string | null | undefined;
  planKey: string | null | undefined;
}) {
  const normalized = [params.planKey, params.planId].filter(Boolean).join(' ').toLowerCase();

  if (normalized.includes('family') || normalized.includes('business')) {
    return FAMILY_MATTER_ALLOWANCE;
  }

  return STANDARD_MATTER_ALLOWANCE;
}

function getRecoveryMatterServiceCode(claimId: string) {
  return `${RECOVERY_MATTER_SERVICE_CODE_PREFIX}${claimId}`;
}

function isRecoveryMatterUsageForClaim(serviceCode: string | null | undefined, claimId: string) {
  return serviceCode?.trim() === getRecoveryMatterServiceCode(claimId);
}

function isRecoveryMatterUsage(serviceCode: string | null | undefined) {
  return serviceCode?.startsWith(RECOVERY_MATTER_SERVICE_CODE_PREFIX) ?? false;
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const normalized = value instanceof Date ? value : new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function buildMatterAllowanceWindow(params: {
  currentPeriodEnd: Date | string | null | undefined;
  currentPeriodStart: Date | string | null | undefined;
  now: Date;
}) {
  const currentPeriodStart = normalizeDate(params.currentPeriodStart);
  const currentPeriodEnd = normalizeDate(params.currentPeriodEnd);

  if (currentPeriodStart && currentPeriodEnd) {
    return { end: currentPeriodEnd, start: currentPeriodStart };
  }

  const fallbackEnd = currentPeriodEnd ?? params.now;
  const fallbackStart = currentPeriodStart
    ? currentPeriodStart
    : new Date(
        Date.UTC(
          fallbackEnd.getUTCFullYear() - 1,
          fallbackEnd.getUTCMonth(),
          fallbackEnd.getUTCDate()
        )
      );

  return { end: fallbackEnd, start: fallbackStart };
}

function isUsageWithinWindow(params: {
  end: Date;
  start: Date;
  usedAt: Date | string | null | undefined;
}) {
  const usedAt = normalizeDate(params.usedAt);
  if (!usedAt) {
    return false;
  }

  return usedAt >= params.start && usedAt <= params.end;
}

/** Update claim status and optionally add a history note */
export async function updateClaimStatusCore(
  params: {
    claimId: string;
    newStatus: string;
    note?: string;
    allowanceOverrideReason?: string;
    isPublicChange?: boolean;
    session: ClaimsSession | null;
    requestHeaders?: Headers; // Optional headers
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { claimId, newStatus, note, isPublicChange = true, session } = params;

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate status
  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status' };
  }
  const status = parsed.data.status as ClaimStatus; // NOSONAR

  const tenantId = ensureTenantId(session);
  const trimmedAllowanceOverrideReason = params.allowanceOverrideReason?.trim() || undefined;

  try {
    const [currentClaim] = await db
      .select({ status: claims.status, userId: claims.userId })
      .from(claims)
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)))
      .limit(1);

    if (!currentClaim) {
      return { success: false, error: 'Claim not found' };
    }

    if (currentClaim.status === status && !note) {
      return { success: true }; // No change needed
    }

    if (currentClaim.status !== status && STAFF_LED_RECOVERY_STATUSES.has(status)) {
      const [agreement] = await db
        .select({
          paymentAuthorizationState: claimEscalationAgreements.paymentAuthorizationState,
          signedAt: claimEscalationAgreements.signedAt,
        })
        .from(claimEscalationAgreements)
        .where(
          withTenant(
            tenantId,
            claimEscalationAgreements.tenantId,
            eq(claimEscalationAgreements.claimId, claimId)
          )
        )
        .limit(1);

      if (!agreement?.signedAt || agreement.paymentAuthorizationState !== 'authorized') {
        return {
          success: false,
          error:
            'Signed escalation agreement and authorized payment collection are required before staff-led recovery can begin',
        };
      }

      const [subscription] = await db
        .select({
          id: subscriptions.id,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          currentPeriodStart: subscriptions.currentPeriodStart,
          planId: subscriptions.planId,
          planKey: subscriptions.planKey,
        })
        .from(subscriptions)
        .where(
          withTenant(
            tenantId,
            subscriptions.tenantId,
            eq(subscriptions.userId, currentClaim.userId)
          )
        )
        .limit(1);

      if (!subscription) {
        return {
          success: false,
          error: 'Membership subscription context is required before staff-led recovery can begin.',
        };
      }

      const existingMatterUsage = await db
        .select({
          id: serviceUsage.id,
          serviceCode: serviceUsage.serviceCode,
          usedAt: serviceUsage.usedAt,
        })
        .from(serviceUsage)
        .where(
          withTenant(
            tenantId,
            serviceUsage.tenantId,
            eq(serviceUsage.subscriptionId, subscription.id)
          )
        )
        .limit(200);

      const allowanceWindow = buildMatterAllowanceWindow({
        currentPeriodEnd: subscription.currentPeriodEnd,
        currentPeriodStart: subscription.currentPeriodStart,
        now: new Date(),
      });
      const matterServiceCode = getRecoveryMatterServiceCode(claimId);
      const alreadyConsumedForClaim = existingMatterUsage.some(row =>
        isRecoveryMatterUsageForClaim(row.serviceCode, claimId)
      );

      if (!alreadyConsumedForClaim) {
        const matterAllowance = resolveMatterAllowance({
          planId: subscription.planId,
          planKey: subscription.planKey,
        });
        const consumedMatterCount = existingMatterUsage.filter(
          row =>
            isRecoveryMatterUsage(row.serviceCode) &&
            isUsageWithinWindow({
              end: allowanceWindow.end,
              start: allowanceWindow.start,
              usedAt: row.usedAt,
            })
        ).length;

        if (consumedMatterCount >= matterAllowance && !trimmedAllowanceOverrideReason) {
          return {
            success: false,
            error: RECOVERY_ALLOWANCE_EXHAUSTED_ERROR,
          };
        }
      }

      const oldStatus = currentClaim.status;

      await db.transaction(async tx => {
        if (!alreadyConsumedForClaim) {
          await tx.insert(serviceUsage).values({
            id: crypto.randomUUID(),
            tenantId,
            subscriptionId: subscription.id,
            userId: currentClaim.userId,
            serviceCode: matterServiceCode,
            usedAt: new Date(),
          });
        }

        // 1. Update claim status
        if (currentClaim.status !== status) {
          await tx
            .update(claims)
            .set({ status: status, updatedAt: new Date() })
            .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));
        }

        // 2. Add history entry
        await tx.insert(claimStageHistory).values({
          id: crypto.randomUUID(),
          tenantId,
          claimId,
          fromStatus: currentClaim.status,
          toStatus: status,
          changedById: session.user.id,
          changedByRole: 'staff',
          note: note || null,
          isPublic: isPublicChange,
          createdAt: new Date(),
        });
      });

      // SECURITY audit log
      if (deps.logAuditEvent) {
        await deps.logAuditEvent({
          actorId: session.user.id,
          actorRole: session.user.role,
          tenantId,
          action: 'claim.status_changed',
          entityType: 'claim',
          entityId: claimId,
          metadata: {
            oldStatus,
            newStatus: status,
            note: note || undefined,
            isPublic: isPublicChange,
            allowanceOverrideReason: trimmedAllowanceOverrideReason,
            matterConsumptionServiceCode: matterServiceCode,
          },
          headers: params.requestHeaders,
        });
      }

      return { success: true };
    }

    const oldStatus = currentClaim.status;

    await db.transaction(async tx => {
      // 1. Update claim status
      if (currentClaim.status !== status) {
        await tx
          .update(claims)
          .set({ status: status, updatedAt: new Date() })
          .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));
      }

      // 2. Add history entry
      await tx.insert(claimStageHistory).values({
        id: crypto.randomUUID(),
        tenantId,
        claimId,
        fromStatus: currentClaim.status,
        toStatus: status,
        changedById: session.user.id,
        changedByRole: 'staff',
        note: note || null,
        isPublic: isPublicChange,
        createdAt: new Date(),
      });
    });

    // 🔒 SECURITY Audit Log
    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId,
        action: 'claim.status_changed', // Same action as admin for consistency
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          oldStatus,
          newStatus: status,
          note: note || undefined,
          isPublic: isPublicChange,
        },
        headers: params.requestHeaders,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to update claim status:', error);
    return { success: false, error: 'Failed to update claim status' };
  }
}
