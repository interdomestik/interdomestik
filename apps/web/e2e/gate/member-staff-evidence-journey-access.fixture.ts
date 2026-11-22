import { E2E_USERS, and, claims, db, eq, user } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { changeClaimStatus } from '@interdomestik/domain-claims/claims/change-status';
import { randomUUID } from 'node:crypto';
import { expect } from '../fixtures/auth.fixture';

export async function verifyOtherRolesCannotChangeStatus(claimId: string) {
  const unauthorizedNotes: string[] = [];
  for (const seeded of [E2E_USERS.KS_MEMBER, E2E_USERS.KS_AGENT, E2E_USERS.KS_BRANCH_MANAGER]) {
    const actor = await db.query.user.findFirst({
      where: and(eq(user.email, seeded.email), eq(user.tenantId, E2E_USERS.KS_MEMBER.tenantId)),
      columns: { branchId: true, id: true, role: true, tenantId: true },
    });
    expect(actor).toMatchObject({
      branchId: seeded.branchId,
      role: seeded.dbRole,
      tenantId: seeded.tenantId,
    });
    if (!actor) throw new Error(`Seeded ${seeded.dbRole} actor missing`);
    const probeNote = `S3 unauthorized ${seeded.dbRole} ${randomUUID()}`;
    unauthorizedNotes.push(probeNote);
    const authority = mintTestTenantAuthority(actor.tenantId, {
      userId: actor.id,
      role: actor.role,
    });
    const result = await changeClaimStatus(
      authority,
      {
        claimId: claimId,
        toStatus: 'verification',
        note: probeNote,
        isPublicNote: false,
      },
      { hostId: actor.tenantId }
    );
    expect(result).toEqual({ ok: false, code: 'forbidden_role' });
  }

  const stillSubmitted = await db.query.claims.findFirst({
    where: and(eq(claims.id, claimId), eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId)),
    columns: { caseLifecycleState: true, recoveryLifecycleState: true },
  });
  expect(stillSubmitted ? claimStatusFromLifecycleFields(stillSubmitted) : null).toBe('submitted');
  return unauthorizedNotes;
}
