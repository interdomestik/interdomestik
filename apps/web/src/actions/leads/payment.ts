'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { ROLE_AGENT } from '@/lib/roles.core';
import { startPayment, startPaymentSchema } from '@interdomestik/domain-leads';
import { UnauthorizedError } from '@interdomestik/shared-auth/errors';

export async function startPaymentAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = startPaymentSchema.parse(input);
    const { actorAgentId, branchId } = ctx.scope;
    if (ctx.userRole !== ROLE_AGENT || !actorAgentId || !branchId) {
      throw new UnauthorizedError('Unauthorized');
    }

    return await startPayment(
      {
        agentId: actorAgentId,
        branchId,
        authority: ctx.authority,
      },
      data
    );
  });
}
