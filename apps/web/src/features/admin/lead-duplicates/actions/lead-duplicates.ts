'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';

import { resolveDuplicateReferralCore } from '../server/duplicate-resolution';
import {
  listDuplicateReferrals,
  type DuplicateReviewState,
} from '../server/list-duplicate-referrals';

export async function listLeadDuplicatesAction(state: DuplicateReviewState) {
  return runAuthenticatedAction(ctx =>
    listDuplicateReferrals(
      { authority: ctx.authority, userRole: ctx.userRole, scope: ctx.scope },
      state === 'resolved' ? 'resolved' : 'pending'
    )
  );
}

export async function resolveLeadDuplicateAction(input: unknown) {
  return runAuthenticatedAction(ctx =>
    resolveDuplicateReferralCore(
      {
        authority: ctx.authority,
        userRole: ctx.userRole,
        scope: ctx.scope,
        actorId: ctx.session.user.id,
      },
      input
    )
  );
}
