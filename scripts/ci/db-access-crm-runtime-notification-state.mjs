// Observe all owned claims and related persistence, including effects on a different fixture claim.
export async function snapshotStatusDenialState(runtime, claimId) {
  const { inArray } = await import('drizzle-orm');
  const { dbAdmin, claims, claimStageHistory, domainEvents, claimTransitionEvidence } = runtime;
  const ids = [claimId, claimId + '-other-staff', claimId + '-foreign'];
  return Promise.all(
    [
      [claims, claims.id],
      [claimStageHistory, claimStageHistory.claimId],
      [domainEvents, domainEvents.entityId],
      [claimTransitionEvidence, claimTransitionEvidence.claimId],
    ].map(([table, column]) =>
      dbAdmin.select().from(table).where(inArray(column, ids)).orderBy(table.id)
    )
  );
}
