import {
  E2E_USERS,
  claimEscalationAgreements,
  claims,
  db,
  eq,
  user,
} from '@interdomestik/database';
import type { TestInfo } from '@playwright/test';
import { and, desc } from 'drizzle-orm';

export async function resolveSeededClaimContext(testInfo: TestInfo) {
  const seededMember = testInfo.project.name.includes('mk')
    ? E2E_USERS.MK_MEMBER
    : E2E_USERS.KS_MEMBER;
  const seededStaff = testInfo.project.name.includes('mk')
    ? E2E_USERS.MK_STAFF
    : E2E_USERS.KS_STAFF;

  const member = await db.query.user.findFirst({
    where: eq(user.email, seededMember.email),
    columns: { id: true, tenantId: true },
  });
  const staff = await db.query.user.findFirst({
    where: eq(user.email, seededStaff.email),
    columns: { id: true },
  });

  if (!member?.id || !member.tenantId) {
    throw new Error(`Expected seeded member context for ${seededMember.email}`);
  }

  if (!staff?.id) {
    throw new Error(`Expected seeded staff context for ${seededStaff.email}`);
  }

  const claim = await db.query.claims.findFirst({
    where: and(eq(claims.tenantId, member.tenantId), eq(claims.userId, member.id)),
    columns: { id: true, status: true },
    orderBy: [desc(claims.createdAt)],
  });

  if (!claim?.id) {
    throw new Error(`Expected a seeded claim for ${seededMember.email}`);
  }

  const existingAgreement = await db.query.claimEscalationAgreements.findFirst({
    where: and(
      eq(claimEscalationAgreements.tenantId, member.tenantId),
      eq(claimEscalationAgreements.claimId, claim.id)
    ),
  });

  return {
    claimId: claim.id,
    currentStatus: claim.status ?? 'submitted',
    existingAgreement,
    memberId: member.id,
    staffId: staff.id,
    tenantId: member.tenantId,
  };
}
