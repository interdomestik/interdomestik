import {
  isStaffOrAdmin,
  ROLE_AGENT,
  ROLE_BRANCH_MANAGER,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';

import { actionFailure, type ActionFailure } from './safe-action.failure';
import type { ActionBasis, ProtectedActionContext, SessionData } from './safe-action.types';

type CodedError = Error & { code?: string };

function codedError(message: string, code: string): CodedError {
  const error: CodedError = new Error(message);
  error.code = code;
  return error;
}

/**
 * Validates session state against the RBAC invariants of every protected action.
 * Throws an error carrying a FORBIDDEN_* code; both wrappers turn it into a refusal.
 */
export function assertSessionContext(session: SessionData): ProtectedActionContext['scope'] {
  const { role, branchId: rawBranchId, id: userId, agentId: rawAgentId } = session.user;
  const branchId = rawBranchId || null;
  const attributedAgentId = rawAgentId || null;

  if (role === ROLE_BRANCH_MANAGER && !branchId) {
    throw codedError(
      'Security Violation: Branch Manager has no active branch context.',
      'FORBIDDEN_NO_BRANCH'
    );
  }

  const actorAgentId = role === ROLE_AGENT ? userId : null;
  if (role === ROLE_AGENT && !actorAgentId) {
    throw codedError('Security Violation: Agent context missing.', 'FORBIDDEN_NO_AGENT');
  }

  if (isStaffOrAdmin(role) || role === ROLE_TENANT_ADMIN) {
    return { branchId: null, actorAgentId: null, attributedAgentId: null };
  }

  return { branchId, actorAgentId, attributedAgentId };
}

/**
 * The declared basis, decided on one fact: the session's own role (owner decision 1). Explicit
 * grants in `user_roles` are not honoured (deprecated for runtime auth); branch, assignment and
 * case scope stay with the owning command. `self` binds the row to the caller inside that command.
 */
export function checkBasis(basis: ActionBasis, session: SessionData): ActionFailure | null {
  if (basis.kind === 'self') return null;
  if (basis.kind === 'role') {
    const role: unknown = session.user.role;
    const allowed = typeof role === 'string' && (basis.roles as readonly string[]).includes(role);
    return allowed ? null : actionFailure('FORBIDDEN');
  }
  // A public basis never reaches the protected path (refused at definition in part 1).
  return actionFailure('FORBIDDEN');
}
