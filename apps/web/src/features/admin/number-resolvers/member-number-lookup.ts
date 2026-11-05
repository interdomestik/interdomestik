import type { TenantTransaction } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

import {
  memberReadWhere,
  type GrantedMemberReadScope,
} from '@/features/admin/members/server/member-read-scope';

/** A parsed member number and the granted member-read scope it is resolved under. */
export type MemberNumberLookup = Readonly<{
  memberNumber: string;
  scope: GrantedMemberReadScope;
}>;

/** Finds the user id for a member number through the borrowed tenant transaction. */
export async function findMemberIdByNumber(
  tx: Pick<TenantTransaction, 'query'>,
  lookup: MemberNumberLookup
): Promise<string | null> {
  // db-access-guard: tenant-scoped -- reason: explicit session access-tenant and branch-scope predicate inside withTenantAuthority
  const foundUser = await tx.query.user.findFirst({
    where: memberReadWhere(lookup.scope, eq(user.memberNumber, lookup.memberNumber)),
    columns: {
      id: true,
    },
  });
  return foundUser?.id ?? null;
}
