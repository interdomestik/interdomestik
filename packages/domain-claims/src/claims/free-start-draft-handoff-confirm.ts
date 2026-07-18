import { randomUUID } from 'node:crypto';

import { and, auditLog, claims, eq, freeStartDrafts, subscriptions } from '@interdomestik/database';
import { generateClaimNumber } from '@interdomestik/database/claim-number';
import type { FreeStartDraftContext } from '@interdomestik/database/free-start-drafts';
import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
} from '@interdomestik/domain-membership-billing';
import { nanoid } from 'nanoid';

import {
  buildFreeStartDraftClaimCopy,
  isEligibleFreeStartDraft,
  withFreeStartHandoffActor,
  type ConfirmFreeStartDraftHandoffResult,
  type FreeStartDraftCandidate,
  type FreeStartDraftHandoffLocale,
} from './free-start-draft-handoff-shared';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import { recordSubmittedClaimLifecycle } from './submitted-claim-lifecycle';

type ConfirmInput = { expectedVersion: number; id: string; locale: FreeStartDraftHandoffLocale };

export async function confirmFreeStartDraftHandoffTransaction(
  context: FreeStartDraftContext,
  input: ConfirmInput
): Promise<ConfirmFreeStartDraftHandoffResult> {
  return withFreeStartHandoffActor(context, async tx => {
    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.tenantId, context.tenantId),
          eq(subscriptions.userId, context.ownerUserId)
        )
      )
      .limit(1)
      .for('share');
    if (!subscription) return { ok: false, code: 'membershipRequired' };

    const [draft] = await tx
      .select()
      .from(freeStartDrafts)
      .where(
        and(
          eq(freeStartDrafts.id, input.id),
          eq(freeStartDrafts.accessTenantId, context.accessTenantId),
          eq(freeStartDrafts.ownerUserId, context.ownerUserId)
        )
      )
      .limit(1)
      .for('update');
    const bucket = getMembershipLifecycleBucket({ subscription });
    if (!membershipLifecycleGrantsAccess(bucket)) {
      return { ok: false, code: 'membershipRequired' };
    }
    if (!draft || !isEligibleFreeStartDraft(draft as FreeStartDraftCandidate)) {
      return { ok: false, code: 'notFound' };
    }
    if (draft.version !== input.expectedVersion) return { ok: false, code: 'draftChanged' };

    const originWhere = and(
      eq(claims.tenantId, context.tenantId),
      eq(claims.userId, context.ownerUserId),
      eq(claims.origin, 'free_start_draft'),
      eq(claims.originRefId, input.id)
    );
    const [existing] = await tx.select({ id: claims.id }).from(claims).where(originWhere).limit(1);
    if (existing) return { ok: true, claimId: existing.id, idempotent: true };

    const claimId = nanoid();
    const createdAt = new Date();
    const copy = buildFreeStartDraftClaimCopy(draft as FreeStartDraftCandidate, input.locale);
    const [inserted] = await tx
      .insert(claims)
      .values({
        id: claimId,
        tenantId: context.tenantId,
        accessTenantId: context.accessTenantId,
        userId: context.ownerUserId,
        branchId: subscription.branchId,
        agentId: subscription.agentId,
        title: copy.title,
        description: copy.description,
        category: draft.category,
        companyName: draft.counterparty!,
        origin: 'free_start_draft',
        originRefId: input.id,
        claimNumber: null,
        ...mapClaimStatusToLifecycleStates('submitted'),
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoNothing()
      .returning({ id: claims.id });
    if (!inserted) {
      const [winner] = await tx.select({ id: claims.id }).from(claims).where(originWhere).limit(1);
      if (winner) return { ok: true, claimId: winner.id, idempotent: true };
      throw new Error('free_start_handoff_conflict_without_owner_winner');
    }

    await generateClaimNumber(tx, { tenantId: context.tenantId, claimId, createdAt });
    await recordSubmittedClaimLifecycle(tx, {
      changedByRole: context.actorRole ?? 'member',
      claimId,
      createdAt,
      data: { files: [] },
      publicNote: null,
      tenantId: context.tenantId,
      userId: context.ownerUserId,
    });
    await tx.insert(auditLog).values({
      id: randomUUID(),
      tenantId: context.tenantId,
      actorId: context.ownerUserId,
      actorRole: context.actorRole,
      action: 'claim.created_from_free_start_draft',
      entityType: 'claim',
      entityId: claimId,
      metadata: { draftVersion: draft.version, origin: 'free_start_draft' },
    });
    return { ok: true, claimId, idempotent: false };
  });
}
