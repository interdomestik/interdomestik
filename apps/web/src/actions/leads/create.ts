'use server';

import { createAgentLeadCore } from '@/features/agent/leads/server/create-agent-lead';
import { runAuthenticatedAction } from '@/lib/safe-action';

export async function createLeadAction(input: unknown, idempotencyKey?: string) {
  return runAuthenticatedAction(ctx =>
    createAgentLeadCore(
      {
        authority: ctx.authority,
        userRole: ctx.userRole,
        agentId: ctx.scope.actorAgentId,
        branchId: ctx.scope.branchId,
      },
      { input, idempotencyKey }
    )
  );
}
