import { db, eq, user as userTable } from '@interdomestik/database';
import { generateMemberNumber } from '@interdomestik/database/member-number';
import { nanoid } from 'nanoid';
import {
  createSelfServeOwnershipAttribution,
  revokeAgentClientReadScope,
} from '../../../ownership-attribution';
import type {
  RequestPasswordResetOnboarding,
  ResolvePaddleCustomer,
  SubscriptionPayloadLike,
} from '../../types';
import { resolveCheckoutTransactionEvidence } from './checkout-transaction-evidence';
import { resolveBranchId } from './context';

type ReconcileCheckoutUserDeps = {
  requestPasswordResetOnboarding?: RequestPasswordResetOnboarding;
  resolvePaddleCustomer?: ResolvePaddleCustomer;
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
  // db-access-guard: system-exempt -- reason: checkout reconciliation probes global email ownership before tenant-scoped user writes
  const userRecord = await db.query.user.findFirst({
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
      createdBy: true,
      assistedByAgentId: true,
    },
  });
  return userRecord ?? null;
}

export async function reconcileCheckoutUser(
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

  let existingUser = await findUserByEmail(customerEmail);
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

  const branchId = await resolveBranchId({ customData: mergedCustomData, tenantId, db });
  const now = new Date();

  let shouldRequestOnboarding = false;
  let userId = existingUser?.id ?? null;

  if (!existingUser) {
    const newUserId = nanoid();
    try {
      const ownershipAttribution = createSelfServeOwnershipAttribution(mergedCustomData?.agentId);
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      await db.transaction(async tx => {
        // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
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

        await revokeAgentClientReadScope(tx, { tenantId, memberId: newUserId });
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

  let credentialAccount: { id: string; providerId: string } | null = null;
  if (userId) {
    // db-access-guard: tenant-scoped -- reason: userId belongs to same-tenant checkout user before credential lookup
    const accountRecord = await db.query.account.findFirst({
      where: (accounts, { and, eq }) =>
        and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')),
      columns: { id: true, providerId: true },
    });
    credentialAccount = accountRecord ?? null;
  }

  if (
    existingUser &&
    (!credentialAccount || existingUser.role !== 'member' || !existingUser.memberNumber)
  ) {
    const nextRole = shouldPromoteRole(existingUser.role) ? 'member' : existingUser.role;
    const ownershipAttribution = createSelfServeOwnershipAttribution(mergedCustomData?.agentId);
    const nextAgentId = existingUser.agentId ?? ownershipAttribution.agentId;
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await db.transaction(async tx => {
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

      if (!existingUser.memberNumber) {
        await generateMemberNumber(tx, {
          userId: existingUser.id,
          joinedAt: now,
        });
      }

      await revokeAgentClientReadScope(tx, { tenantId, memberId: existingUser.id });
    });

    shouldRequestOnboarding = !credentialAccount;
  }

  // db-access-guard: tenant-scoped -- reason: tenantId from reconciled checkout context constrains final user reload
  const finalUser = await db.query.user.findFirst({
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
