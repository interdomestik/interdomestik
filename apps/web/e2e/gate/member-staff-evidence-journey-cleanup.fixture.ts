import {
  E2E_USERS,
  and,
  auditLog,
  claimDocuments,
  claimMessages,
  claimStageHistory,
  claims,
  db,
  domainEventDeliveries,
  domainEvents,
  eq,
  freeStartDrafts,
  inArray,
  notifications,
} from '@interdomestik/database';
import { expect } from '../fixtures/auth.fixture';

export type S3JourneyIdentity = { counterparty: string; summary: string };
export const S3_JOURNEY_INCIDENT_DATE = '2026-09-16';

export function exactClaimDescription(journey: S3JourneyIdentity): string {
  return [
    'Category: Vehicle',
    'Issue: Collision',
    `Incident date: ${S3_JOURNEY_INCIDENT_DATE}`,
    `Counterparty: ${journey.counterparty}`,
    'Desired outcome: Repair',
    `Summary: ${journey.summary}`,
  ].join('\n');
}

async function claimIdsForJourney(
  claimId: string | null,
  journey: S3JourneyIdentity
): Promise<string[]> {
  const matchingClaims = await db.query.claims.findMany({
    where: and(
      eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId),
      eq(claims.description, exactClaimDescription(journey))
    ),
    columns: { id: true },
  });
  return [...new Set([claimId, ...matchingClaims.map(row => row.id)].filter(Boolean))] as string[];
}

export async function cleanupJourney(
  claimId: string | null,
  journey: S3JourneyIdentity
): Promise<void> {
  const claimIds = await claimIdsForJourney(claimId, journey);
  await db.transaction(async tx => {
    if (claimIds.length) {
      const events = await tx.query.domainEvents.findMany({
        where: and(
          inArray(domainEvents.entityId, claimIds),
          eq(domainEvents.tenantId, E2E_USERS.KS_MEMBER.tenantId)
        ),
        columns: { id: true },
      });
      const eventIds = events.map(event => event.id);
      if (eventIds.length) {
        await tx
          .delete(domainEventDeliveries)
          .where(inArray(domainEventDeliveries.eventId, eventIds));
        await tx.delete(domainEvents).where(inArray(domainEvents.id, eventIds));
      }
      await tx
        .delete(auditLog)
        .where(
          and(
            eq(auditLog.tenantId, E2E_USERS.KS_MEMBER.tenantId),
            inArray(auditLog.entityId, claimIds)
          )
        );
      await tx.delete(notifications).where(
        and(
          eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
          inArray(
            notifications.actionUrl,
            claimIds.map(id => `/member/claims/${id}`)
          )
        )
      );
      for (const table of [claimStageHistory, claimDocuments, claimMessages] as const) {
        await tx
          .delete(table)
          .where(
            and(eq(table.tenantId, E2E_USERS.KS_MEMBER.tenantId), inArray(table.claimId, claimIds))
          );
      }
      await tx
        .delete(claims)
        .where(
          and(eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId), inArray(claims.id, claimIds))
        );
    }
    await tx
      .delete(freeStartDrafts)
      .where(
        and(
          eq(freeStartDrafts.tenantId, E2E_USERS.KS_MEMBER.tenantId),
          eq(freeStartDrafts.summary, journey.summary)
        )
      );
  });
}

export async function expectJourneyClean(
  claimId: string | null,
  journey: S3JourneyIdentity
): Promise<void> {
  const claimIds = await claimIdsForJourney(claimId, journey);
  const selection = { columns: { id: true } } as const;
  const [claimRows, draftRows, eventRows, historyRows, notificationRows, auditRows] =
    await Promise.all([
      claimIds.length
        ? db.query.claims.findMany({
            ...selection,
            where: and(
              eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              inArray(claims.id, claimIds)
            ),
          })
        : [],
      db.query.freeStartDrafts.findMany({
        ...selection,
        where: and(
          eq(freeStartDrafts.tenantId, E2E_USERS.KS_MEMBER.tenantId),
          eq(freeStartDrafts.summary, journey.summary)
        ),
      }),
      claimIds.length
        ? db.query.domainEvents.findMany({
            ...selection,
            where: and(
              inArray(domainEvents.entityId, claimIds),
              eq(domainEvents.tenantId, E2E_USERS.KS_MEMBER.tenantId)
            ),
          })
        : [],
      claimIds.length
        ? db.query.claimStageHistory.findMany({
            ...selection,
            where: and(
              eq(claimStageHistory.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              inArray(claimStageHistory.claimId, claimIds)
            ),
          })
        : [],
      claimIds.length
        ? db.query.notifications.findMany({
            ...selection,
            where: and(
              eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              inArray(
                notifications.actionUrl,
                claimIds.map(id => `/member/claims/${id}`)
              )
            ),
          })
        : [],
      claimIds.length
        ? db.query.auditLog.findMany({
            ...selection,
            where: and(
              eq(auditLog.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              inArray(auditLog.entityId, claimIds)
            ),
          })
        : [],
    ]);
  expect({ auditRows, claimRows, draftRows, eventRows, historyRows, notificationRows }).toEqual({
    auditRows: [],
    claimRows: [],
    draftRows: [],
    eventRows: [],
    historyRows: [],
    notificationRows: [],
  });
}
