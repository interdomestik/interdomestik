import type { TenantTransaction } from '@interdomestik/database';
import { claims, user } from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { buildStaffClaimReadScope, canStaffReadClaim } from './scope';

type ClaimScope = { tenantId: string; claimId: string };
type AssignedClaimScope = ClaimScope & { staffId: string | null };
type StaffCandidate = Pick<typeof user.$inferSelect, 'id' | 'role' | 'branchId' | 'emailVerified'>;

export async function resolveStaffClaimNotificationRecipients(
  tx: TenantTransaction,
  claim: AssignedClaimScope
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

export async function isStaffClaimNotificationRecipient(
  tx: TenantTransaction,
  claim: AssignedClaimScope,
  recipient: Pick<StaffCandidate, 'id' | 'role'>
) {
  const candidateIds = claim.staffId === null ? [recipient.id] : [recipient.id, claim.staffId];
  // The assignee is the only other candidate who can displace a qualifying staff recipient.
  const candidates = tx
    .select({ id: user.id, role: user.role, branchId: user.branchId })
    .from(user)
    .where(
      and(
        eq(user.tenantId, claim.tenantId),
        recipient.role === ROLES.tenant_admin
          ? or(inArray(user.id, candidateIds), eq(user.role, ROLES.staff))
          : inArray(user.id, candidateIds)
      )
    )
    .orderBy(user.id)
    .for('share')
    .as('notification_candidates');
  const [selected] = await tx
    .select({ id: candidates.id })
    .from(candidates)
    .innerJoin(claims, and(eq(claims.tenantId, claim.tenantId), eq(claims.id, claim.claimId)))
    .where(
      or(
        and(
          eq(candidates.role, ROLES.staff),
          buildStaffClaimReadScope({
            claimId: claim.claimId,
            role: ROLES.staff,
            userId: candidates.id,
            branchId: candidates.branchId,
          })
        ),
        and(eq(candidates.role, ROLES.tenant_admin), eq(candidates.id, recipient.id))
      )
    )
    .orderBy(
      desc(eq(candidates.role, ROLES.staff)),
      desc(sql`${candidates.id} is not distinct from ${claim.staffId}`)
    )
    .limit(1);
  return selected?.id === recipient.id;
}
