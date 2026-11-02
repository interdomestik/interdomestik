import { and, eq } from 'drizzle-orm';
import { dbAdmin } from './db';
import { generateMemberNumber, type GenerateMemberNumberResult } from './member-number';
import { user } from './schema/auth';
import { readTenantAuthority, type TenantAuthority } from './tenant-authority';

// Member numbers come from one global sequence (`member_counters`) that is deny-all to the runtime
// role, so a tenant transaction cannot advance it. A member committed in the authority's tenant
// receives its number here, on its own connection, after that transaction has committed. The
// counter increment and the member update share one transaction and the existing generator never
// overwrites a number, so no number is assigned twice. Unused counter values (gaps) remain possible,
// as they already were, e.g. when a concurrent self-heal loses the conditional update.

export type TenantMemberNumberRequest = Readonly<{ userId: string; joinedAt: Date }>;

/**
 * Issues (or returns the already issued) member number of a committed member of the authority's
 * tenant. Returns null, advancing nothing, when no such member exists.
 */
export async function issueTenantMemberNumber(
  authority: TenantAuthority,
  request: TenantMemberNumberRequest
): Promise<GenerateMemberNumberResult | null> {
  const { tenantId } = readTenantAuthority(authority);
  const userId = typeof request.userId === 'string' ? request.userId.trim() : '';
  const joinedAt = request.joinedAt;
  if (!userId || !(joinedAt instanceof Date) || Number.isNaN(joinedAt.getTime())) return null;

  // db-access-guard: system-exempt -- reason: global member-number sequence for one committed member of the authority's tenant
  return await dbAdmin.transaction(async tx => {
    const [member] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId), eq(user.role, 'member')))
      .for('update')
      .limit(1);
    if (!member) return null;
    return generateMemberNumber(tx, { userId, joinedAt });
  });
}
