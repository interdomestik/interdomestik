'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { createLead, createLeadSchema } from '@interdomestik/domain-leads';

export async function createLeadAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = createLeadSchema.parse(input);
    const { user } = ctx.session;
    const { branchId } = ctx.scope;

    if (!branchId) {
      throw new Error('Agent must belong to a branch to create leads.');
    }

    return await createLead(
      {
        tenantId: user.tenantId,
        agentId: user.id,
        branchId: branchId,
      },
      data
    );
  });
}
