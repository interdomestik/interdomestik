import {
  eq,
  hasTenantMemberCredential,
  issueTenantMemberNumber,
  user as userTable,
} from '@interdomestik/database';
import { authorizePaddleBillingTenant } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';
import {
  createSelfServeOwnershipAttribution,
  revokeAgentClientReadScope,
} from '../../../ownership-attribution';
import { RetryablePaddleWebhookError } from '../../errors';
import type {
  RequestPasswordResetOnboarding,
  ResolvePaddleCustomer,
  SubscriptionPayloadLike,
} from '../../types';
import { resolveCheckoutTransactionEvidence } from './checkout-transaction-evidence';
import { resolveBranchId } from './context';
import {
  normalizeText,
  shouldPromoteRole,
  isUniqueViolation,
  findUserByEmail,
} from './reconcile-checkout-user-lookup';

type ReconcileCheckoutUserDeps = {
  requestPasswordResetOnboarding?: RequestPasswordResetOnboarding;
  resolvePaddleCustomer?: ResolvePaddleCustomer;
};

export type ReconciledUserRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  name: string | null;
  role: string;
  memberNumber: string | null;
  createdBy?: string | null;
  assistedByAgentId?: string | null;
  agentId?: string | null;
};

// The global member number is issued for a committed member on its own connection. The membership
// confirmation needs it, so a failure fails the delivery as retryable: the receipt is released for
// redelivery, and the retry finds the member without a number on the existing-user path and issues
// it there.
async function issueReconciledMemberNumber(
  authority: TenantAuthority,
  userId: string,
  joinedAt: Date
): Promise<void> {
  let issued: Awaited<ReturnType<typeof issueTenantMemberNumber>>;
  try {
    issued = await issueTenantMemberNumber(authority, { userId, joinedAt });
  } catch (cause) {
    throw new RetryablePaddleWebhookError(
      `Member number issuance failed for reconciled user ${userId}`,
      { cause }
    );
  }
  if (!issued) {
    throw new RetryablePaddleWebhookError(
      `Member number was not issued for reconciled user ${userId}`
    );
  }
}

export async function reconcileCheckoutUser(
  delivery: IngressCapability<'paddle-delivery'>,
  sub: SubscriptionPayloadLike,
  deps: ReconcileCheckoutUserDeps = {},
  processingScopeKey = ''
) {
  const evidence = await resolveCheckoutTransactionEvidence(
    sub,
    processingScopeKey,
    deps.resolvePaddleCustomer
  );
  if (!evidence) return null;

  const { customerEmail, customData: mergedCustomData } = evidence;
  const tenantId = normalizeText(mergedCustomData.tenantId)!;

  // The evidence tenant is provider-supplied: it is acceptable only because the billing producer
  // checks it against the billing tenant the verified entity route bound. An unbound delivery, or
  // evidence naming another tenant, cannot reconcile; nothing has been read or written yet.
  let billingAuthority: TenantAuthority;
  try {
    billingAuthority = authorizePaddleBillingTenant(delivery, tenantId);
  } catch (error) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; checkout tenant ${tenantId} is not the verified billing tenant of this delivery: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }

  const emailOwner = await findUserByEmail(delivery, customerEmail);
  if (emailOwner === 'ambiguous') {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; email ownership for ${customerEmail} is ambiguous or not visible in its owning tenant`
    );
    return null;
  }
  let existingUser = emailOwner;
  const customDataUserId = normalizeText(mergedCustomData?.userId);

  if (existingUser && existingUser.tenantId !== tenantId) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; tenant mismatch for ${customerEmail}: existing=${existingUser.tenantId} payload=${tenantId}`
    );
    return null;
  }

  if (customDataUserId && existingUser?.id !== customDataUserId) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; customData user=${customDataUserId} does not match canonical email user=${existingUser?.id ?? 'none'}`
    );
    return null;
  }

  const branchId = await withTenantAuthority(billingAuthority, tx =>
    resolveBranchId({ customData: mergedCustomData, tenantId, db: tx })
  );
  const now = new Date();

  let shouldRequestOnboarding = false;
  let userId = existingUser?.id ?? null;

  if (!existingUser) {
    const newUserId = nanoid();
    try {
      const ownershipAttribution = createSelfServeOwnershipAttribution(mergedCustomData?.agentId);
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      await withTenantAuthority(billingAuthority, async tx => {
        // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
        await tx.insert(userTable).values({
          id: newUserId,
          tenantId,
          branchId,
          name: '',
          email: customerEmail,
          emailVerified: false,
          role: 'member',
          ...ownershipAttribution,
          createdAt: now,
          updatedAt: now,
        });

        await revokeAgentClientReadScope(tx, { tenantId, memberId: newUserId });
      });
      await issueReconciledMemberNumber(billingAuthority, newUserId, now);

      shouldRequestOnboarding = true;
      userId = newUserId;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const racedOwner = await findUserByEmail(delivery, customerEmail);
      if (!racedOwner || racedOwner === 'ambiguous' || racedOwner.tenantId !== tenantId) {
        throw error;
      }
      existingUser = racedOwner;

      userId = existingUser.id;
    }
  }

  // Credentials are identity data the tenant transaction cannot read; their existence is read by
  // the fixed tenant-bound projection.
  const hasCredential = userId ? await hasTenantMemberCredential(billingAuthority, userId) : false;

  if (
    existingUser &&
    (!hasCredential || existingUser.role !== 'member' || !existingUser.memberNumber)
  ) {
    const nextRole = shouldPromoteRole(existingUser.role) ? 'member' : existingUser.role;
    const ownershipAttribution = createSelfServeOwnershipAttribution(mergedCustomData?.agentId);
    const nextAgentId = existingUser.agentId ?? ownershipAttribution.agentId;
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await withTenantAuthority(billingAuthority, async tx => {
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      await tx
        .update(userTable)
        .set({
          role: nextRole,
          branchId: existingUser.branchId ?? branchId ?? null,
          agentId: nextAgentId,
          assistedByAgentId: ownershipAttribution.assistedByAgentId,
          createdBy: existingUser.createdBy ?? ownershipAttribution.createdBy,
          updatedAt: now,
        })
        .where(eq(userTable.id, existingUser.id));

      await revokeAgentClientReadScope(tx, { tenantId, memberId: existingUser.id });
    });
    if (!existingUser.memberNumber) {
      await issueReconciledMemberNumber(billingAuthority, existingUser.id, now);
    }

    shouldRequestOnboarding = !hasCredential;
  }

  // db-access-guard: tenant-scoped -- reason: tenantId from reconciled checkout context constrains final user reload
  const finalUser = await withTenantAuthority(billingAuthority, async tx =>
    tx.query.user.findFirst({
      where: (users, { and, eq }) =>
        and(eq(users.email, customerEmail), eq(users.tenantId, tenantId)),
      columns: {
        id: true,
        tenantId: true,
        branchId: true,
        email: true,
        name: true,
        role: true,
        memberNumber: true,
        agentId: true,
      },
    })
  );

  if (!finalUser) {
    console.warn(
      `[Webhook] Checkout user reconciliation could not reload member for subscription ${sub.id} email=${customerEmail}`
    );
    return null;
  }

  if (shouldRequestOnboarding && deps.requestPasswordResetOnboarding) {
    try {
      await deps.requestPasswordResetOnboarding({
        email: customerEmail,
        tenantId,
      });
    } catch (error) {
      console.error(
        `[Webhook] Failed to send onboarding password reset for subscription ${sub.id} email=${customerEmail}`,
        error
      );
    }
  }

  return {
    userId: finalUser.id,
    tenantId,
    branchId: finalUser.branchId ?? branchId,
    customData: mergedCustomData,
    userRecord: finalUser,
    existingSub: undefined,
  };
}
