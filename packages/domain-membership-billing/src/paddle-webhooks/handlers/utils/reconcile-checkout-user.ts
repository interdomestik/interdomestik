import { eq, user as userTable, withTenantContext } from '@interdomestik/database';
import { resolvePaddleCustomerEmailOwner } from '@interdomestik/database/paddle-provider-resolution';
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

/**
 * Global email ownership: the privileged probe names the owning user/tenant (or reports ambiguity),
 * and the full record is read inside that owner's tenant. Ambiguity is a conflict.
 */
async function findUserByEmail(email: string): Promise<ReconciledUserRecord | null | 'ambiguous'> {
  const owner = await resolvePaddleCustomerEmailOwner(email);
  if (owner === 'ambiguous' || !owner) return owner;

  const userRecord = await withTenantContext({ tenantId: owner.tenantId }, tx =>
    tx.query.user.findFirst({
      where: (users, { and, eq }) =>
        and(eq(users.id, owner.userId), eq(users.tenantId, owner.tenantId)),
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
    })
  );
  // The owner was resolved but is not visible in its tenant: treat as a conflict, never as absent.
  return userRecord ?? 'ambiguous';
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

  const emailOwner = await findUserByEmail(customerEmail);
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

  const branchId = await withTenantContext({ tenantId }, tx =>
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
      await withTenantContext({ tenantId }, async tx => {
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

      const racedOwner = await findUserByEmail(customerEmail);
      if (!racedOwner || racedOwner === 'ambiguous' || racedOwner.tenantId !== tenantId) {
        throw error;
      }
      existingUser = racedOwner;

      userId = existingUser.id;
    }
  }

  let credentialAccount: { id: string; providerId: string } | null = null;
  if (userId) {
    // db-access-guard: tenant-scoped -- reason: userId belongs to same-tenant checkout user before credential lookup
    const accountRecord = await withTenantContext({ tenantId }, async tx =>
      tx.query.account.findFirst({
        where: (accounts, { and, eq }) =>
          and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')),
        columns: { id: true, providerId: true },
      })
    );
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
    await withTenantContext({ tenantId }, async tx => {
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
  const finalUser = await withTenantContext({ tenantId }, async tx =>
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
