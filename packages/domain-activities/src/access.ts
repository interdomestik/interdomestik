import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ROLES, isSuperAdmin, isTenantAdmin } from '@interdomestik/shared-auth';

import type { ActivitySession } from './types';

// Who may read and write CRM activities. Every check denies by default: a role that is not named
// here (member portal roles on staff data, promoter, auditor, global_support, any unknown role) is
// refused before any read (R-16: the rule lives in the owning package, not in the entry points).

export type ActivityActor = { tenantId: string; userId: string; role: string };

/**
 * The actor of an activity command is the authority's principal, never the session alone: a
 * session that names another user or another role than the authority it came with is refused.
 */
export function activityActorOf(
  session: ActivitySession,
  authority: TenantAuthority
): ActivityActor | null {
  const { tenantId, principal } = readTenantAuthority(authority);
  if (!principal?.role || principal.userId !== session.user.id) return null;
  // Exact: a padded session role is refused, as every role check on base compared it as stored.
  if (principal.role !== session.user.role) return null;
  return { tenantId, userId: principal.userId, role: principal.role };
}

/** Member portal roles: `user` is the legacy default role of a member account. */
function isMemberSelfRole(role: string): boolean {
  return role === ROLES.member || role === 'user';
}

/** Roles that may log and read the activities of a CRM lead; an agent only for its own lead. */
export function isLeadActivityRole(role: string | null | undefined): boolean {
  return role === ROLES.admin || role === ROLES.staff || role === ROLES.agent;
}

/** Whether the actor may see or log this lead's activities, given the lead's assigned agent. */
export function canAccessLead(actor: { id: string; role: string }, leadAgentId: string): boolean {
  if (!isLeadActivityRole(actor.role)) return false;
  return actor.role !== ROLES.agent || leadAgentId === actor.id;
}

/** own: the member's own activities; assigned: an agent's assigned members; tenant: any member. */
export type MemberActivityScope = 'own' | 'assigned' | 'tenant' | 'denied';

export function memberActivityReadScope(role: string | null | undefined): MemberActivityScope {
  if (typeof role !== 'string') return 'denied';
  if (isMemberSelfRole(role)) return 'own';
  if (role === ROLES.agent) return 'assigned';
  // Case content stays with staff and the tenant and super admins; a branch manager sees counts
  // only (owner decision of 2026-11-17, REUSE-CATALOG "Role predicates"), so it is refused here.
  return role === ROLES.staff || isTenantAdmin(role) || isSuperAdmin(role) ? 'tenant' : 'denied';
}

/** Members never log activities; an agent logs for its assigned members only. */
export function memberActivityWriteScope(role: string | null | undefined): MemberActivityScope {
  const scope = memberActivityReadScope(role);
  return scope === 'own' ? 'denied' : scope;
}
