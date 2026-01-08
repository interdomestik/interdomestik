import { auth } from '@/lib/auth';
import {
  isStaffOrAdmin,
  ROLE_AGENT,
  ROLE_BRANCH_MANAGER,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers as nextHeaders } from 'next/headers';

export type ActionError = {
  success: false;
  error: string;
  code?: string;
  issues?: Record<string, string>;
};

export type ActionSuccess<T> = {
  success: true;
  data?: T;
};

export type ActionResult<T> = Promise<ActionSuccess<T> | ActionError>;

type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type ProtectedActionContext = {
  session: SessionData;
  tenantId: string;
  requestHeaders: Headers;
  userRole: string;
  scope: {
    branchId: string | null;
    actorAgentId: string | null;
    attributedAgentId: string | null;
  };
};

/**
 * Validates session state against RBAC invariants.
 * Throws errors with codes to be caught by the wrapper.
 */
/**
 * Validates session state against RBAC invariants.
 * Throws errors with codes to be caught by the wrapper.
 */
function assertSessionContext(session: SessionData): ProtectedActionContext['scope'] {
  const { role, branchId: rawBranchId, id: userId, agentId: rawAgentId } = session.user;
  const branchId = rawBranchId || null;
  const attributedAgentId = rawAgentId || null;

  validateBranchManagerInvariant(role, branchId);

  const actorAgentId = getActorAgentId(role, userId);

  if (isStaffOrAdmin(role) || role === ROLE_TENANT_ADMIN) {
    return { branchId: null, actorAgentId: null, attributedAgentId: null };
  }

  return { branchId, actorAgentId, attributedAgentId };
}

function validateBranchManagerInvariant(role: string, branchId: string | null) {
  if (role === ROLE_BRANCH_MANAGER && !branchId) {
    const error = new Error('Security Violation: Branch Manager has no active branch context.');
    (error as any).code = 'FORBIDDEN_NO_BRANCH';
    throw error;
  }
}

function getActorAgentId(role: string, userId: string): string | null {
  const actorAgentId = role === ROLE_AGENT ? userId : null;
  if (role === ROLE_AGENT && !actorAgentId) {
    const error = new Error('Security Violation: Agent context missing.');
    (error as any).code = 'FORBIDDEN_NO_AGENT';
    throw error;
  }
  return actorAgentId;
}

/**
 * Wraps a server action logic block with standardized Authentication and Tenancy checks.
 *
 * @param handler The business logic to execute if auth/tenancy checks pass.
 */
export async function runAuthenticatedAction<T>(
  handler: (ctx: ProtectedActionContext) => Promise<T>
): ActionResult<T> {
  try {
    const requestHeaders = await nextHeaders();
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    // This throws if tenant is missing, enforcing safety
    const tenantId = ensureTenantId(session);

    // Enforce RBAC Invariants
    let scope;
    try {
      scope = assertSessionContext(session);
    } catch (e: any) {
      // Catch validation errors from logic above
      if (e.code?.startsWith('FORBIDDEN')) {
        return { success: false, error: e.message, code: e.code };
      }
      throw e;
    }

    const data = await handler({
      session,
      tenantId,
      requestHeaders,
      userRole: session.user.role,
      scope,
    });

    // If the handler returns a result object (success/error), return it directly
    // Otherwise wrap it in success.
    if (data && typeof data === 'object' && ('success' in data || 'error' in data)) {
      return data as any;
    }

    return { success: true, data };
  } catch (error) {
    if (error instanceof Error) {
      // Handle known errors (like our custom validation errors)
      if (error.name === 'MissingTenantError') {
        return { success: false, error: 'Missing tenant context', code: 'MISSING_TENANT' };
      }
      if ((error as any).code?.startsWith('FORBIDDEN')) {
        return { success: false, error: error.message, code: (error as any).code };
      }
    }
    console.error('Action failed:', error);
    return { success: false, error: 'Internal Server Error' };
  }
}
