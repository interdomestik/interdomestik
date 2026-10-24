import { withTenantContext } from '@interdomestik/database';

import { createAdminCrmRoutingRuleRepository } from '@/adapters/crm/routing-repository';

import {
  AdminCrmRoutingAccessDeniedError,
  getAdminCrmRoutingRulesCore as readRules,
  resolveAdminCrmRoutingActor,
  runAdminCrmRoutingRuleAction as runAction,
} from './_routing-core';
import type { AdminCrmRoutingActionResult } from './_routing-types';

export {
  AdminCrmRoutingAccessDeniedError,
  getAdminCrmRoutingErrorMessageKey,
  resolveAdminCrmRoutingActor,
  type AdminCrmRoutingActionKind,
} from './_routing-core';

export async function getAdminCrmRoutingRulesCore(args: Parameters<typeof readRules>[0]) {
  if (args.actor.role !== 'admin') throw new AdminCrmRoutingAccessDeniedError();
  return withTenantContext({ tenantId: args.actor.tenantId }, tx =>
    readRules(args, { repository: createAdminCrmRoutingRuleRepository(tx) })
  );
}

class RoutingActionRollback extends Error {
  constructor(readonly result: AdminCrmRoutingActionResult) {
    super('CRM routing action rolled back');
  }
}

export async function runAdminCrmRoutingRuleAction(
  args: Parameters<typeof runAction>[0]
): Promise<AdminCrmRoutingActionResult> {
  const actor = resolveAdminCrmRoutingActor(args.session);
  if (!actor) return { reason: 'forbidden', status: 'error' };
  try {
    return await withTenantContext({ tenantId: actor.tenantId }, async tx => {
      const result = await runAction(args, { repository: createAdminCrmRoutingRuleRepository(tx) });
      if (result.status !== 'ok') throw new RoutingActionRollback(result);
      return result;
    });
  } catch (error) {
    if (error instanceof RoutingActionRollback) return error.result;
    console.error('[Admin CRM Routing] transaction failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      kind: args.kind,
      tenantId: actor.tenantId,
    });
    return { reason: 'repository_failure', status: 'error' };
  }
}
