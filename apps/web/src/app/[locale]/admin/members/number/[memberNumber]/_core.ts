import { user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

export interface MemberNumberResolverResult {
  ok: boolean;
  userId?: string;
  error?: 'FORBIDDEN' | 'NOT_FOUND';
}

/**
 * Pure core logic for resolving a member number to a user ID.
 * Validates role-based access and tenant-scoped existence.
 */
export async function getMemberNumberResolverCore(params: {
  memberNumber: string;
  tenantId: string;
  role: string;
  allowedRoles: string[];
  db: any;
  parseMemberNumber: (num: string) => any;
}): Promise<MemberNumberResolverResult> {
  const { memberNumber, tenantId, role, allowedRoles, db, parseMemberNumber } = params;

  // 1. Auth Guard
  if (!allowedRoles.includes(role)) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  // 2. Validate Format
  const parsed = parseMemberNumber(memberNumber);
  if (!parsed) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  // 3. Lookup User
  const foundUser = await db.query.user.findFirst({
    where: and(eq(user.memberNumber, memberNumber), eq(user.tenantId, tenantId)),
    columns: {
      id: true,
    },
  });

  if (!foundUser) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  return { ok: true, userId: foundUser.id as string };
}
