import type { TenantTransaction } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq, or } from 'drizzle-orm';
import { canStaffReadClaim } from './scope';

type ClaimScope = { tenantId: string; claimId: string };
type StaffCandidate = Pick<typeof user.$inferSelect, 'id' | 'role' | 'branchId' | 'emailVerified'>;

export async function resolveStaffClaimNotificationRecipients(
  tx: TenantTransaction,
  claim: ClaimScope & { staffId: string | null }
) {
  const users = await tx
    .select({
      id: user.id,
      role: user.role,
      branchId: user.branchId,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(
      and(
        eq(user.tenantId, claim.tenantId),
        or(
          eq(user.role, ROLES.staff),
          eq(user.role, ROLES.tenant_admin),
          claim.staffId ? eq(user.id, claim.staffId) : undefined
        )
      )
    )
    .orderBy(user.id)
    .for('share');

  const scopedStaff: StaffCandidate[] = [];
  for await (const recipient of users.filter(candidate => candidate.role === ROLES.staff)) {
    const admitted = await canStaffReadClaim(tx, {
      tenantId: claim.tenantId,
      claimId: claim.claimId,
      userId: recipient.id,
      branchId: recipient.branchId,
    });
    if (admitted) scopedStaff.push(recipient);
  }
  const assignee = scopedStaff.find(recipient => recipient.id === claim.staffId);
  if (assignee) return [assignee];
  if (scopedStaff.length > 0) return scopedStaff;
  return users.filter(recipient => recipient.role === ROLES.tenant_admin);
}
