import type { CrmActorContext } from '../context';
import type { CrmLead } from '../leads/types';
import type { SupportHandoff } from '../support-handoffs/types';

export type CrmTimelineReadDenialReason = 'tenant_scope' | 'actor_scope';

export type CrmTimelineReadAuthorization =
  | { allowed: true }
  | { allowed: false; reason: CrmTimelineReadDenialReason };

function matchesActorIdentity(
  actor: CrmActorContext,
  value: string | null | undefined,
  scopeKey: 'agentId' | 'memberId' | 'staffId'
): boolean {
  return value === actor.actorId || value === actor.scope[scopeKey];
}

function matchesBranchScope(actor: CrmActorContext, branchId: string | null | undefined): boolean {
  return actor.scope.branchId != null && branchId === actor.scope.branchId;
}

export function authorizeCrmLeadTimelineRead(
  actor: CrmActorContext,
  lead: Pick<CrmLead, 'agentId' | 'branchId' | 'tenantId'>
): CrmTimelineReadAuthorization {
  if (lead.tenantId !== actor.tenantId) {
    return { allowed: false, reason: 'tenant_scope' };
  }

  if (actor.role === 'admin' || actor.role === 'staff') {
    return { allowed: true };
  }

  if (actor.role === 'branch_manager' && matchesBranchScope(actor, lead.branchId)) {
    return { allowed: true };
  }

  if (actor.role === 'agent' && matchesActorIdentity(actor, lead.agentId, 'agentId')) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'actor_scope' };
}

export function authorizeSupportHandoffTimelineRead(
  actor: CrmActorContext,
  handoff: Pick<SupportHandoff, 'branchId' | 'memberId' | 'staffId' | 'tenantId'>
): CrmTimelineReadAuthorization {
  if (handoff.tenantId !== actor.tenantId) {
    return { allowed: false, reason: 'tenant_scope' };
  }

  if (actor.role === 'admin') {
    return { allowed: true };
  }

  if (actor.role === 'member' && matchesActorIdentity(actor, handoff.memberId, 'memberId')) {
    return { allowed: true };
  }

  if (actor.role === 'branch_manager' && matchesBranchScope(actor, handoff.branchId)) {
    return { allowed: true };
  }

  const staffOwnsOrMayReceive =
    handoff.staffId == null || matchesActorIdentity(actor, handoff.staffId, 'staffId');
  if (
    actor.role === 'staff' &&
    staffOwnsOrMayReceive &&
    matchesBranchScope(actor, handoff.branchId)
  ) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'actor_scope' };
}
