import { randomUUID } from 'node:crypto';
import { and, claims, claimStageHistory, db, E2E_USERS, eq, user } from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { cleanupInformationRequest } from './information-request-cleanup.fixture';

export async function withInformationRequestFixture<T>(
  run: (fixture: {
    claimId: string;
    tenantId: string;
    staffId: string;
    privateNote: string;
  }) => Promise<T>
): Promise<T> {
  const tenantId = E2E_USERS.KS_MEMBER.tenantId;
  const [member, staff] = await Promise.all(
    [E2E_USERS.KS_MEMBER, E2E_USERS.KS_STAFF].map(actor =>
      db.query.user.findFirst({
        where: and(eq(user.tenantId, tenantId), eq(user.email, actor.email)),
      })
    )
  );
  if (!member || !staff) throw new Error('S4 seeded actors missing');
  const claimId = `s4-${randomUUID()}`;
  const privateNote = `S4 staff-only ${randomUUID()}`;
  try {
    await db.insert(claims).values({
      id: claimId,
      tenantId,
      accessTenantId: tenantId,
      userId: member.id,
      staffId: staff.id,
      branchId: staff.branchId,
      title: 'S4 information request',
      category: 'vehicle',
      companyName: 'S4 fixture insurer',
      ...claimLifecycleFieldsForStatus('verification'),
    });
    await db.insert(claimStageHistory).values({
      id: `history-${claimId}`,
      tenantId,
      claimId,
      toStatus: 'verification',
      changedById: staff.id,
      changedByRole: 'staff',
      note: privateNote,
      isPublic: false,
    });
    return await run({ claimId, tenantId, staffId: staff.id, privateNote });
  } finally {
    await cleanupInformationRequest(claimId, tenantId);
  }
}
