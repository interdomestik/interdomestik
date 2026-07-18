import { and, claims, eq, freeStartDrafts, subscriptions } from '@interdomestik/database';
import type { FreeStartDraftContext } from '@interdomestik/database/free-start-drafts';
import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
} from '@interdomestik/domain-membership-billing';

import { confirmFreeStartDraftHandoffTransaction } from './free-start-draft-handoff-confirm';
import {
  freeStartDraftHandoffFacts,
  isEligibleFreeStartDraft,
  withFreeStartHandoffActor,
  type ConfirmFreeStartDraftHandoffResult,
  type FreeStartDraftCandidate,
  type FreeStartDraftHandoffLocale,
  type ReviewFreeStartDraftHandoffResult,
} from './free-start-draft-handoff-shared';

export {
  buildFreeStartDraftClaimCopy,
  isEligibleFreeStartDraft,
  type ConfirmFreeStartDraftHandoffResult,
  type FreeStartDraftHandoffFacts,
  type FreeStartDraftHandoffLocale,
  type ReviewFreeStartDraftHandoffResult,
} from './free-start-draft-handoff-shared';

export async function reviewFreeStartDraftHandoff(
  context: FreeStartDraftContext,
  draftId: string
): Promise<ReviewFreeStartDraftHandoffResult> {
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
      .limit(1);
    const grantsAccess = subscription
      ? membershipLifecycleGrantsAccess(getMembershipLifecycleBucket({ subscription }))
      : false;
    if (!subscription || !grantsAccess) return { ok: false, code: 'membershipRequired' };

    const [draft] = await tx
      .select()
      .from(freeStartDrafts)
      .where(
        and(
          eq(freeStartDrafts.id, draftId),
          eq(freeStartDrafts.accessTenantId, context.accessTenantId),
          eq(freeStartDrafts.ownerUserId, context.ownerUserId)
        )
      )
      .limit(1);
    if (!draft || !isEligibleFreeStartDraft(draft as FreeStartDraftCandidate)) {
      return { ok: false, code: 'notFound' };
    }
    const [linked] = await tx
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, context.tenantId),
          eq(claims.userId, context.ownerUserId),
          eq(claims.origin, 'free_start_draft'),
          eq(claims.originRefId, draftId)
        )
      )
      .limit(1);
    return { ok: true, claimId: linked?.id ?? null, facts: freeStartDraftHandoffFacts(draft) };
  });
}

export function confirmFreeStartDraftHandoff(
  context: FreeStartDraftContext,
  input: { expectedVersion: number; id: string; locale: FreeStartDraftHandoffLocale }
): Promise<ConfirmFreeStartDraftHandoffResult> {
  return confirmFreeStartDraftHandoffTransaction(context, input);
}
