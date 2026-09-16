import {
  and,
  claimInformationRequests,
  claims,
  claimStageHistory,
  db,
  eq,
} from '@interdomestik/database';
import { expect } from '../fixtures/auth.fixture';

export async function cleanupInformationRequest(claimId: string, tenantId: string) {
  if (!/^s4-[a-f0-9-]{36}$/u.test(claimId)) throw new Error('S4 cleanup identity invalid');
  await db.transaction(async tx => {
    await tx
      .delete(claimInformationRequests)
      .where(
        and(
          eq(claimInformationRequests.tenantId, tenantId),
          eq(claimInformationRequests.claimId, claimId)
        )
      );
    await tx
      .delete(claimStageHistory)
      .where(and(eq(claimStageHistory.tenantId, tenantId), eq(claimStageHistory.claimId, claimId)));
    await tx.delete(claims).where(and(eq(claims.tenantId, tenantId), eq(claims.id, claimId)));
  });
  expect(
    await db
      .select({ id: claimInformationRequests.id })
      .from(claimInformationRequests)
      .where(eq(claimInformationRequests.claimId, claimId))
  ).toEqual([]);
  expect(await db.select({ id: claims.id }).from(claims).where(eq(claims.id, claimId))).toEqual([]);
}
