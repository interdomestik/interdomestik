import type { ProtectedActionContext } from '@/lib/safe-action';
import { isStaffOrHigher } from '@interdomestik/shared-auth';

/**
 * Trusted, server-derived context for verification reads.
 * Satisfied by the action context and by the API's plain verification context.
 */
export type VerificationReadContext = {
  tenantId: string;
  userRole: string;
  scope: { branchId: string | null };
};

export type VerificationReadScope =
  { kind: 'tenant' } | { kind: 'branch'; branchId: string } | { kind: 'none' };

function verificationReadForbidden(): Error {
  const error = new Error('Forbidden: verification reads require an operations role');
  (error as Error & { code?: string }).code = 'FORBIDDEN';
  return error;
}

/**
 * Local resource admission for verification reads, evaluated before any transaction.
 * Throws FORBIDDEN for roles outside the canonical five; branch-scoped roles without a
 * branch resolve to `none` so callers return their existing empty shape.
 */
export function resolveVerificationReadScope(ctx: VerificationReadContext): VerificationReadScope {
  if (!isStaffOrHigher(ctx.userRole)) {
    throw verificationReadForbidden();
  }
  if (ctx.userRole === 'branch_manager' || ctx.userRole === 'staff') {
    return ctx.scope.branchId ? { kind: 'branch', branchId: ctx.scope.branchId } : { kind: 'none' };
  }
  return { kind: 'tenant' };
}

/**
 * The shared action wrapper clears staff scope; verification reads need the staff branch.
 * Restores it only from the verified session when both context and session roles are staff.
 */
export function withSessionStaffBranch(ctx: ProtectedActionContext): ProtectedActionContext {
  if (ctx.userRole !== 'staff') {
    return ctx;
  }
  const sessionUser = ctx.session.user;
  const branchId = sessionUser.role === 'staff' ? sessionUser.branchId || null : null;
  return { ...ctx, scope: { ...ctx.scope, branchId } };
}
