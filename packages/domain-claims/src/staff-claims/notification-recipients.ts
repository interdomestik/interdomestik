import type { TenantTransaction } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq, or } from 'drizzle-orm';
import { canStaffReadClaim } from './scope';

type ClaimScope = { tenantId: string; claimId: string };
type StaffCandidate = Pick<typeof user.$inferSelect, 'id' | 'role' | 'branchId' | 'emailVerified'>;

export async function canReceiveStaffClaimNotification(
  tx: TenantTransaction,
  claim: ClaimScope,
  recipient: { id: string; role: string | null; branchId: string | null }
) {
  if (recipient.role === ROLES.tenant_admin) return true;
  if (recipient.role !== ROLES.staff) return false;
  return canStaffReadClaim(tx, {
    ...claim,
    userId: recipient.id,
    branchId: recipient.branchId,
  });
}

async function collectScopedStaff(
  tx: TenantTransaction,
  claim: ClaimScope,
  candidates: Iterator<StaffCandidate, undefined>,
  scopedStaff: StaffCandidate[]
): Promise<void> {
  const next = candidates.next();
  if (next.done) return;
  const recipient = next.value;
  if (
    recipient.role === ROLES.staff &&
    (await canReceiveStaffClaimNotification(tx, claim, recipient))
  ) {
    scopedStaff.push(recipient);
  }
  return collectScopedStaff(tx, claim, candidates, scopedStaff);
}

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

  const scopedStaff: typeof users = [];
  const staffScope = { tenantId: claim.tenantId, claimId: claim.claimId };
  await collectScopedStaff(tx, staffScope, users.values(), scopedStaff);
  const assignee = scopedStaff.find(recipient => recipient.id === claim.staffId);
  if (assignee) return [assignee];
  if (scopedStaff.length > 0) return scopedStaff;
  return users.filter(recipient => recipient.role === ROLES.tenant_admin);
}
