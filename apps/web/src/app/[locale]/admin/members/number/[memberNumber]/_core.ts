import type { TenantTransaction } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

/** Relational-query surface of the transaction supplied by withTenantContext. */
export type MemberNumberLookupTx = Pick<TenantTransaction, 'query'>;

/** Runs the lookup inside the caller-owned tenant context and returns its value. */
export type MemberNumberTenantRunner = (
  lookup: (tx: MemberNumberLookupTx) => Promise<string | null>
) => Promise<string | null>;

export type MemberNumberResolverResult =
  { ok: true; userId: string } | { ok: false; error: 'FORBIDDEN' | 'NOT_FOUND' };

/**
 * Core logic for resolving a member number to a user ID.
 * Validates role-based access and format before any lookup, then queries only through the
 * supplied tenant transaction so RLS evaluates the session's tenant context.
 */
export async function getMemberNumberResolverCore(params: {
  memberNumber: string;
  tenantId: string;
  role: string | null | undefined;
  allowedRoles: readonly string[];
  parseMemberNumber: (num: string) => unknown;
  inTenantContext: MemberNumberTenantRunner;
}): Promise<MemberNumberResolverResult> {
  const { memberNumber, tenantId, role, allowedRoles, parseMemberNumber, inTenantContext } = params;

  // 1. Auth Guard
  if (!role || !allowedRoles.includes(role)) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  // 2. Validate Format
  const parsed = parseMemberNumber(memberNumber);
  if (!parsed) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  // 3. Lookup User
  const userId = await inTenantContext(async tx => {
    // db-access-guard: tenant-scoped -- reason: explicit session access-tenant predicate inside withTenantContext
    const foundUser = await tx.query.user.findFirst({
      where: and(eq(user.memberNumber, memberNumber), eq(user.tenantId, tenantId)),
      columns: {
        id: true,
      },
    });
    return foundUser?.id ?? null;
  });

  if (!userId) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  return { ok: true, userId };
}
