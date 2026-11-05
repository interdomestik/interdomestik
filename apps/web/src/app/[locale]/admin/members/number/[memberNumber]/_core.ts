import { resolveMemberReadScope } from '@/features/admin/members/server/member-read-scope';
import type { MemberNumberLookup } from '@/features/admin/number-resolvers/member-number-lookup';

/** Resolves the lookup inside the caller-owned tenant context and returns the user id. */
export type MemberNumberTenantLookup = (lookup: MemberNumberLookup) => Promise<string | null>;

export type MemberNumberResolverResult =
  { ok: true; userId: string } | { ok: false; error: 'FORBIDDEN' | 'NOT_FOUND' };

/**
 * Core logic for resolving a member number to a user ID.
 * Validates role-based access, member-read scope and format before any lookup, then queries only
 * through the supplied tenant lookup so RLS evaluates the session's tenant context.
 */
export async function getMemberNumberResolverCore(params: {
  memberNumber: string;
  tenantId: string;
  role: string | null | undefined;
  branchId: string | null;
  allowedRoles: readonly string[];
  parseMemberNumber: (num: string) => unknown;
  inTenantContext: MemberNumberTenantLookup;
}): Promise<MemberNumberResolverResult> {
  const {
    memberNumber,
    tenantId,
    role,
    branchId,
    allowedRoles,
    parseMemberNumber,
    inTenantContext,
  } = params;

  // 1. Auth Guard
  if (!role || !allowedRoles.includes(role)) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  // 2. Member-read scope (branch managers are limited to their own branch)
  const scope = resolveMemberReadScope({ tenantId, actor: { role, branchId } });
  if (!scope.ok) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  // 3. Validate Format
  const parsed = parseMemberNumber(memberNumber);
  if (!parsed) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  // 4. Lookup User (member-read scoped, inside the caller's tenant transaction)
  const userId = await inTenantContext({ memberNumber, scope });

  if (!userId) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  return { ok: true, userId };
}
