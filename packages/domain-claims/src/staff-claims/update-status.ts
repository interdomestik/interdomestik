import {
  and,
  claimEscalationAgreements,
  claimStageHistory,
  claims,
  db,
  eq,
  membershipPlans,
  or,
  serviceUsage,
  sql,
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
type NormalizableDate = Date | string | null | undefined;
type UpdateClaimStatusParams = {
  claimId: string;
  newStatus: string;
  note?: string;
  allowanceOverrideReason?: string;
  isPublicChange?: boolean;
  session: ClaimsSession | null;
  requestHeaders?: Headers;
};
type CurrentClaimRecord = {
  status: ClaimStatus | null;
  userId: string;
};
type RecoveryStatusChangeParams = {
  claimId: string;
  currentClaim: CurrentClaimRecord;
  deps: ClaimsDeps;
  isPublicChange: boolean;
  note?: string;
  requestHeaders?: Headers;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
  trimmedAllowanceOverrideReason?: string;
};

async function resolveMatterAllowance(params: {
  tenantId: string;
  planId: string | null | undefined;
  planKey: string | null | undefined;
}) {
  const planKeyCondition = params.planKey ? eq(membershipPlans.id, params.planKey) : undefined;
  const planIdCondition = params.planId
    ? or(eq(membershipPlans.id, params.planId), eq(membershipPlans.paddlePriceId, params.planId))
    : undefined;
  const lookupCondition =
    planKeyCondition && planIdCondition
      ? or(planKeyCondition, planIdCondition)
      : (planKeyCondition ?? planIdCondition);

  if (!lookupCondition) {
    return STANDARD_MATTER_ALLOWANCE;
  }

  const [plan] = await db
    .select({ tier: membershipPlans.tier })
    .from(membershipPlans)
    .where(withTenant(params.tenantId, membershipPlans.tenantId, lookupCondition))
    .limit(1);

  if (plan?.tier === 'family' || plan?.tier === 'business') {
    return FAMILY_MATTER_ALLOWANCE;
  }

  return STANDARD_MATTER_ALLOWANCE;
}

function getRecoveryMatterServiceCode(claimId: string) {
  return `${RECOVERY_MATTER_SERVICE_CODE_PREFIX}${claimId}`;
}

function normalizeDate(value: NormalizableDate) {
  if (!value) return null;
  const normalized = value instanceof Date ? value : new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function buildMatterAllowanceWindow(params: {
  currentPeriodEnd: NormalizableDate;
  currentPeriodStart: NormalizableDate;
  now: Date;
}) {
  const currentPeriodStart = normalizeDate(params.currentPeriodStart);
  const currentPeriodEnd = normalizeDate(params.currentPeriodEnd);

  if (currentPeriodStart && currentPeriodEnd) {
    return { end: currentPeriodEnd, start: currentPeriodStart };
  }

  const fallbackEnd = currentPeriodEnd ?? params.now;
  const fallbackStart =
    currentPeriodStart ??
    new Date(
      Date.UTC(
        fallbackEnd.getUTCFullYear() - 1,
        fallbackEnd.getUTCMonth(),
        fallbackEnd.getUTCDate()
      )
    );

  return { end: fallbackEnd, start: fallbackStart };
}

async function hasRecoveryMatterUsageForClaim(params: {
  claimId: string;
  subscriptionId: string;
  tenantId: string;
}) {
  const [existingUsage] = await db
    .select({ id: serviceUsage.id })
    .from(serviceUsage)
    .where(
      withTenant(
        params.tenantId,
        serviceUsage.tenantId,
        and(
          eq(serviceUsage.subscriptionId, params.subscriptionId),
          eq(serviceUsage.serviceCode, getRecoveryMatterServiceCode(params.claimId))
        )
      )
    )
    .limit(1);

  return Boolean(existingUsage);
}

async function countRecoveryMatterUsageInWindow(params: {
  end: Date;
  start: Date;
  subscriptionId: string;
  tenantId: string;
}) {
  const [usageCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(serviceUsage)
    .where(
      withTenant(
        params.tenantId,
        serviceUsage.tenantId,
        and(
          eq(serviceUsage.subscriptionId, params.subscriptionId),
          sql`${serviceUsage.serviceCode} like ${`${RECOVERY_MATTER_SERVICE_CODE_PREFIX}%`}`,
          sql`${serviceUsage.usedAt} >= ${params.start}`,
          sql`${serviceUsage.usedAt} <= ${params.end}`
        )
      )
    )
    .limit(1);

  return Number(usageCount?.count ?? 0);
}

async function handleStaffLedRecoveryStatusChange(
  params: RecoveryStatusChangeParams
): Promise<ActionResult> {
  const {
    claimId,
    currentClaim,
    deps,
    isPublicChange,
    note,
    requestHeaders,
    session,
    status,
    tenantId,
    trimmedAllowanceOverrideReason,
  } = params;
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
      withTenant(tenantId, subscriptions.tenantId, eq(subscriptions.userId, currentClaim.userId))
    )
    .limit(1);

  if (!subscription) {
    return {
      success: false,
      error: 'Membership subscription context is required before staff-led recovery can begin.',
    };
  }

  const allowanceWindow = buildMatterAllowanceWindow({
    currentPeriodEnd: subscription.currentPeriodEnd,
    currentPeriodStart: subscription.currentPeriodStart,
    now: new Date(),
  });
  const matterServiceCode = getRecoveryMatterServiceCode(claimId);
  const alreadyConsumedForClaim = await hasRecoveryMatterUsageForClaim({
    claimId,
    subscriptionId: subscription.id,
    tenantId,
  });

  if (!alreadyConsumedForClaim) {
    const matterAllowance = await resolveMatterAllowance({
      tenantId,
      planId: subscription.planId,
      planKey: subscription.planKey,
    });
    const consumedMatterCount = await countRecoveryMatterUsageInWindow({
      end: allowanceWindow.end,
      start: allowanceWindow.start,
      subscriptionId: subscription.id,
      tenantId,
    });

    if (consumedMatterCount >= matterAllowance && !trimmedAllowanceOverrideReason) {
      return {
        success: false,
        error: RECOVERY_ALLOWANCE_EXHAUSTED_ERROR,
      };
    }
  }

  return finalizeClaimStatusChange({
    auditMetadata: {
      allowanceOverrideReason: trimmedAllowanceOverrideReason,
      matterConsumptionServiceCode: matterServiceCode,
    },
    beforePersist: async tx => {
      if (alreadyConsumedForClaim) {
        return;
      }

      await tx
        .insert(serviceUsage)
        .values({
          id: crypto.randomUUID(),
          tenantId,
          subscriptionId: subscription.id,
          userId: currentClaim.userId,
          serviceCode: matterServiceCode,
          usedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [serviceUsage.tenantId, serviceUsage.subscriptionId, serviceUsage.serviceCode],
        })
        .returning({ id: serviceUsage.id });
    },
    claimId,
    currentStatus: currentClaim.status,
    deps,
    isPublicChange,
    note,
    requestHeaders,
    session,
    status,
    tenantId,
  });
}

type ClaimsTransaction = {
  insert: typeof db.insert;
  update: typeof db.update;
};

async function persistClaimStatusChange(params: {
  claimId: string;
  currentStatus: ClaimStatus | null;
  isPublicChange: boolean;
  note?: string;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
  tx: ClaimsTransaction;
}) {
  const { claimId, currentStatus, isPublicChange, note, session, status, tenantId, tx } = params;

  if (currentStatus !== status) {
    await tx
      .update(claims)
      .set({ status, updatedAt: new Date() })
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));
  }

  await tx.insert(claimStageHistory).values({
    id: crypto.randomUUID(),
    tenantId,
    claimId,
    fromStatus: currentStatus,
    toStatus: status,
    changedById: session.user.id,
    changedByRole: 'staff',
    note: note || null,
    isPublic: isPublicChange,
    createdAt: new Date(),
  });
}

async function logClaimStatusAudit(params: {
  auditMetadata?: Record<string, boolean | string | undefined>;
  claimId: string;
  currentStatus: ClaimStatus | null;
  deps: ClaimsDeps;
  isPublicChange: boolean;
  note?: string;
  requestHeaders?: Headers;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
}) {
  const {
    auditMetadata,
    claimId,
    currentStatus,
    deps,
    isPublicChange,
    note,
    requestHeaders,
    session,
    status,
    tenantId,
  } = params;

  if (!deps.logAuditEvent) {
    return;
  }

  await deps.logAuditEvent({
    actorId: session.user.id,
    actorRole: session.user.role,
    tenantId,
    action: 'claim.status_changed',
    entityType: 'claim',
    entityId: claimId,
    metadata: {
      oldStatus: currentStatus,
      newStatus: status,
      note: note || undefined,
      isPublic: isPublicChange,
      ...auditMetadata,
    },
    headers: requestHeaders,
  });
}

async function finalizeClaimStatusChange(params: {
  auditMetadata?: Record<string, boolean | string | undefined>;
  beforePersist?: (tx: ClaimsTransaction) => Promise<void>;
  claimId: string;
  currentStatus: ClaimStatus | null;
  deps: ClaimsDeps;
  isPublicChange: boolean;
  note?: string;
  requestHeaders?: Headers;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
}): Promise<ActionResult> {
  const { beforePersist, ...rest } = params;

  await db.transaction(async tx => {
    if (beforePersist) {
      await beforePersist(tx);
    }

    await persistClaimStatusChange({
      claimId: rest.claimId,
      currentStatus: rest.currentStatus,
      isPublicChange: rest.isPublicChange,
      note: rest.note,
      session: rest.session,
      status: rest.status,
      tenantId: rest.tenantId,
      tx,
    });
  });

  await logClaimStatusAudit(rest);

  return { success: true };
}

/** Update claim status and optionally add a history note */
export async function updateClaimStatusCore(
  params: UpdateClaimStatusParams,
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
      return handleStaffLedRecoveryStatusChange({
        claimId,
        currentClaim,
        deps,
        isPublicChange,
        note,
        requestHeaders: params.requestHeaders,
        session,
        status,
        tenantId,
        trimmedAllowanceOverrideReason,
      });
    }

    return finalizeClaimStatusChange({
      claimId,
      currentStatus: currentClaim.status,
      deps,
      isPublicChange,
      note,
      requestHeaders: params.requestHeaders,
      session,
      status,
      tenantId,
    });
  } catch (error) {
    console.error('Failed to update claim status:', error);
    return { success: false, error: 'Failed to update claim status' };
  }
}
