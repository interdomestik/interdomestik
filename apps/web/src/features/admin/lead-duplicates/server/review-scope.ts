import { ROLE_BRANCH_MANAGER, isAdmin } from '@/lib/roles.core';

/** Trusted, server-derived context for duplicate review (satisfied by the action context). */
export type DuplicateReviewContext = {
  userRole: string;
  scope: { branchId: string | null };
};

export type DuplicateReviewScope =
  { kind: 'tenant' } | { kind: 'branch'; branchId: string } | { kind: 'none' };

/** Resolving a possible duplicate is a management decision: tenant admins and branch managers. */
export function canReviewLeadDuplicates(role: string | null | undefined): boolean {
  return isAdmin(role ?? '') || role === ROLE_BRANCH_MANAGER;
}

function duplicateReviewForbidden(): Error {
  const error = new Error('Forbidden: duplicate review requires a management role');
  (error as Error & { code?: string }).code = 'FORBIDDEN';
  return error;
}

/**
 * Resource admission for duplicate review, evaluated before any transaction. Tenant admins
 * review the whole session tenant; a branch manager reviews only own-branch referrals and
 * resolves to `none` without a branch. Every other role is refused (IDA-CRM-003).
 */
export function resolveDuplicateReviewScope(ctx: DuplicateReviewContext): DuplicateReviewScope {
  if (isAdmin(ctx.userRole)) return { kind: 'tenant' };
  if (ctx.userRole === ROLE_BRANCH_MANAGER) {
    return ctx.scope.branchId ? { kind: 'branch', branchId: ctx.scope.branchId } : { kind: 'none' };
  }
  throw duplicateReviewForbidden();
}

/**
 * A branch manager sees a referral only when both the submitting branch and the existing
 * lead's current branch are the manager's own. A cross-branch duplicate would disclose another
 * branch's lead, so only tenant-scope reviewers see it.
 */
export function isReferralInScope(
  scope: DuplicateReviewScope,
  referral: { submittingBranchId: string | null; leadBranchId: string | null }
): boolean {
  if (scope.kind === 'tenant') return true;
  if (scope.kind === 'none') return false;
  return referral.submittingBranchId === scope.branchId && referral.leadBranchId === scope.branchId;
}
