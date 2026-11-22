'use server';

import { actionFailure, runAuthenticatedAction } from '@/lib/safe-action';
import { listVisibleMemberLeads, memberLeadListRefusal } from '@interdomestik/domain-leads/list';

/**
 * The member leads the signed-in user may see. Who sees what is decided by `domain-leads` from the
 * session's tenant authority, bound to the session's user (R-16); a role outside its allow-list,
 * or an authority minted for another user, is refused before any read and the refusal is recorded
 * by the wrapper.
 */
export async function listLeadsAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const actor = ctx.session.user;
    const refusal = memberLeadListRefusal(actor, ctx.authority);
    if (refusal) return actionFailure(refusal);

    const result = await listVisibleMemberLeads(actor, ctx.authority, input);
    if (!result.ok) return actionFailure(result.code);
    return result.leads;
  });
}
