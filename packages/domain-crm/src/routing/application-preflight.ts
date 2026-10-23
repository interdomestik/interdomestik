import type { CrmActorContext } from '../context';
import type {
  ApplyCrmLeadRoutingDecisionInput,
  ApplyCrmLeadRoutingDecisionResult,
} from './application-service';

function normalizeIdempotencyKey(value: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function authorizeApplicationActor(
  actor: CrmActorContext
): Extract<ApplyCrmLeadRoutingDecisionResult, { outcome: 'rejected' }> | null {
  if (!actor.tenantId?.trim()) return { outcome: 'rejected', reason: 'tenant_scope' };
  if (actor.role === 'admin') return null;
  if (actor.role !== 'branch_manager') return { outcome: 'rejected', reason: 'role_scope' };
  if (!actor.scope.branchId?.trim()) return { outcome: 'rejected', reason: 'branch_scope' };
  return null;
}

// Shared domain preflight; callers must supply a trusted internal actor.
export function preflightCrmLeadRoutingDecision(
  input: ApplyCrmLeadRoutingDecisionInput
): Extract<ApplyCrmLeadRoutingDecisionResult, { outcome: 'rejected' }> | null {
  if (!normalizeIdempotencyKey(input.idempotencyKey))
    return { outcome: 'rejected', reason: 'invalid_override' };
  return authorizeApplicationActor(input.actor);
}
