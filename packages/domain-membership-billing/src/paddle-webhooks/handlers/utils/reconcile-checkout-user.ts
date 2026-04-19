import { db, eq, user as userTable } from '@interdomestik/database';
import { generateMemberNumber } from '@interdomestik/database/member-number';
import { nanoid } from 'nanoid';
import { createSelfServeOwnershipAttribution } from '../../../ownership-attribution';
import type { RequestPasswordResetOnboarding } from '../../types';
import { resolveBranchId } from './context';

type CheckoutCustomData = {
  userId?: string;
  agentId?: string;
  tenantId?: string;
  acquisitionSource?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

type SubscriptionPayloadLike = {
  id: string;
  transactionId?: string | null;
  transaction_id?: string | null;
  customData?: CheckoutCustomData;
  custom_data?: CheckoutCustomData;
};

type TransactionPayloadLike = {
  customerEmail?: string | null;
  customer_email?: string | null;
  customData?: CheckoutCustomData;
  custom_data?: CheckoutCustomData;
};

type ReconcileCheckoutUserDeps = {
  requestPasswordResetOnboarding?: RequestPasswordResetOnboarding;
};

type ReconciledUserRecord = {
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

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function emailDisplayName(email: string): string {
  return email.split('@')[0]?.trim() || 'Member';
}

function toCustomData(
  value: CheckoutCustomData | undefined,
  fallback: CheckoutCustomData | undefined
): CheckoutCustomData | undefined {
  if (!value && !fallback) return undefined;
  return { ...fallback, ...value };
}

function shouldPromoteRole(role: string | null | undefined): boolean {
  return !role || role === 'user' || role === 'member';
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === '23505'
  );
}

async function findUserByEmail(email: string): Promise<ReconciledUserRecord | null> {
  return (
    (await db.query.user.findFirst({
      where: (users, { eq }) => eq(users.email, email),
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
    })) ?? null
  );
}

export async function reconcileCheckoutUser(
  sub: SubscriptionPayloadLike,
  deps: ReconcileCheckoutUserDeps = {}
) {
  const transactionId = normalizeText(sub.transactionId || sub.transaction_id);
  if (!transactionId) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; missing transactionId`
    );
    return null;
  }

  const webhookEvent = await db.query.webhookEvents.findFirst({
    where: (events, { eq }) => eq(events.providerTransactionId, transactionId),
    columns: { payload: true },
  });

  const payload = webhookEvent?.payload as { data?: TransactionPayloadLike } | undefined;
  const transactionData = payload?.data;
  if (!transactionData) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; stored transaction ${transactionId} not found`
    );
    return null;
  }

  const mergedCustomData = toCustomData(
    sub.customData || sub.custom_data,
    transactionData.customData || transactionData.custom_data
  );
  const tenantId = normalizeText(mergedCustomData?.tenantId);
  const customerEmail = normalizeText(
    transactionData.customerEmail || transactionData.customer_email
  )?.toLowerCase();

  if (!tenantId || !customerEmail) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; missing tenant/email in stored transaction ${transactionId}`
    );
    return null;
  }

  let existingUser = await findUserByEmail(customerEmail);

  if (existingUser && existingUser.tenantId !== tenantId) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; tenant mismatch for ${customerEmail}: existing=${existingUser.tenantId} payload=${tenantId}`
    );
    return null;
  }

  const branchId = await resolveBranchId({ customData: mergedCustomData, tenantId, db });
  const now = new Date();

  let shouldRequestOnboarding = false;
  let userId = existingUser?.id ?? null;

  if (!existingUser) {
    const newUserId = nanoid();
    try {
      const ownershipAttribution = createSelfServeOwnershipAttribution(mergedCustomData?.agentId);
      await db.transaction(async tx => {
        await tx.insert(userTable).values({
          id: newUserId,
          tenantId,
          branchId,
          name: emailDisplayName(customerEmail),
          email: customerEmail,
          emailVerified: false,
          role: 'member',
          ...ownershipAttribution,
          createdAt: now,
          updatedAt: now,
        });

        await generateMemberNumber(tx, {
          userId: newUserId,
          joinedAt: now,
        });
      });

      shouldRequestOnboarding = true;
      userId = newUserId;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      existingUser = await findUserByEmail(customerEmail);
      if (!existingUser || existingUser.tenantId !== tenantId) {
        throw error;
      }

      userId = existingUser.id;
    }
  }

  const credentialAccount = userId
    ? await db.query.account.findFirst({
        where: (accounts, { and, eq }) =>
          and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')),
        columns: { id: true, providerId: true },
      })
    : null;

  if (
    existingUser &&
    (!credentialAccount || existingUser.role !== 'member' || !existingUser.memberNumber)
  ) {
    const nextRole = shouldPromoteRole(existingUser.role) ? 'member' : existingUser.role;
    const ownershipAttribution = createSelfServeOwnershipAttribution(mergedCustomData?.agentId);
    await db.transaction(async tx => {
      await tx
        .update(userTable)
        .set({
          role: nextRole,
          branchId: existingUser.branchId ?? branchId ?? null,
          agentId: existingUser.agentId ?? ownershipAttribution.agentId,
          assistedByAgentId: ownershipAttribution.assistedByAgentId,
          createdBy: existingUser.createdBy ?? ownershipAttribution.createdBy,
          updatedAt: now,
        })
        .where(eq(userTable.id, existingUser.id));

      if (!existingUser.memberNumber) {
        await generateMemberNumber(tx, {
          userId: existingUser.id,
          joinedAt: now,
        });
      }
    });

    shouldRequestOnboarding = !credentialAccount;
  }

  const finalUser = await db.query.user.findFirst({
    where: (users, { eq }) => eq(users.email, customerEmail),
    columns: {
      id: true,
      tenantId: true,
      branchId: true,
      email: true,
      name: true,
      role: true,
      memberNumber: true,
    },
  });

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
