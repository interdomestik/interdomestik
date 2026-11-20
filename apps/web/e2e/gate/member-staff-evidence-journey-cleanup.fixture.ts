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
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import de from '../../src/messages/de/freeStart.json';
import en from '../../src/messages/en/freeStart.json';
import mk from '../../src/messages/mk/freeStart.json';
import sq from '../../src/messages/sq/freeStart.json';
import sr from '../../src/messages/sr/freeStart.json';
import { expect } from '../fixtures/auth.fixture';

export type S3JourneyIdentity = { counterparty: string; summary: string };
export const S3_JOURNEY_INCIDENT_DATE = '2026-09-16';

type FreeStartCatalog = (typeof en)['freeStart'];
const CATALOGS: ReadonlyArray<readonly [string, FreeStartCatalog]> = [
  ['sq', sq.freeStart],
  ['en', en.freeStart],
  ['sr', sr.freeStart],
  ['mk', mk.freeStart],
  ['de', de.freeStart],
];

function localizedDescription(locale: string, text: FreeStartCatalog, journey: S3JourneyIdentity) {
  const [year, month, day] = S3_JOURNEY_INCIDENT_DATE.split('-');
  const date = locale === 'en' ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;
  const labels = text.preview;
  return [
    `${labels.categoryLabel}: ${text.categories.vehicle.title}`,
    `${labels.issueLabel}: ${text.issues.vehicle.collision}`,
    `${labels.dateLabel}: ${date}`,
    `${labels.counterpartyLabel}: ${journey.counterparty}`,
    `${labels.outcomeLabel}: ${text.outcomes.repair}`,
    `${labels.summaryLabel}: ${journey.summary}`,
  ].join('\n');
}

/**
 * Exact stored descriptions of a journey claim: the text follows the submit locale, and the
 * legacy English form keeps residue from older runs cleanable.
 */
export function exactClaimDescriptions(journey: S3JourneyIdentity): string[] {
  const legacy = [
    'Category: Vehicle',
    'Issue: Collision',
    `Incident date: ${S3_JOURNEY_INCIDENT_DATE}`,
    `Counterparty: ${journey.counterparty}`,
    'Desired outcome: Repair',
    `Summary: ${journey.summary}`,
  ].join('\n');
  return [legacy, ...CATALOGS.map(([locale, text]) => localizedDescription(locale, text, journey))];
}

async function claimIdsForJourney(
  claimId: string | null,
  journey: S3JourneyIdentity
): Promise<string[]> {
  const matches = await db.query.claims.findMany({
    where: and(
      eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId),
      inArray(claims.description, exactClaimDescriptions(journey))
    ),
    columns: { id: true },
  });
  return [...new Set([claimId, ...matches.map(row => row.id)].filter(Boolean))] as string[];
}

async function drainJourneyNotifications(ids: string[]): Promise<void> {
  for (const claimId of ids) {
    const claim = await db.query.claims.findFirst({
      where: and(eq(claims.id, claimId), eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId)),
      columns: { caseLifecycleState: true, recoveryLifecycleState: true },
    });
    if (!claim) continue;
    const types = ['claim_submitted'];
    if (claimStatusFromLifecycleFields(claim) !== 'submitted') {
      types.unshift('claim_status_changed');
    }
    await expect
      .poll(
        async () => {
          const r = await db.query.notifications.findMany({
            where: and(
              eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              eq(notifications.actionUrl, `/member/claims/${claimId}`),
              inArray(notifications.type, types)
            ),
            columns: { type: true },
            orderBy: notifications.type,
          });
          return r.map(row => row.type);
        },
        { timeout: 15_000 }
      )
      .toEqual(types);
  }
}

export async function cleanupJourney(
  claimId: string | null,
  journey: S3JourneyIdentity
): Promise<void> {
  const ids = await claimIdsForJourney(claimId, journey);
  try {
    await drainJourneyNotifications(ids);
  } finally {
    await db.transaction(async tx => {
      if (ids.length) {
        const events = await tx.query.domainEvents.findMany({
          where: and(
            inArray(domainEvents.entityId, ids),
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
              inArray(auditLog.entityId, ids)
            )
          );
        await tx.delete(notifications).where(
          and(
            eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
            inArray(
              notifications.actionUrl,
              ids.map(id => `/member/claims/${id}`)
            )
          )
        );
        for (const table of [claimStageHistory, claimDocuments, claimMessages] as const) {
          await tx
            .delete(table)
            .where(
              and(eq(table.tenantId, E2E_USERS.KS_MEMBER.tenantId), inArray(table.claimId, ids))
            );
        }
        await tx
          .delete(claims)
          .where(and(eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId), inArray(claims.id, ids)));
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
}

export async function expectJourneyClean(
  claimId: string | null,
  journey: S3JourneyIdentity
): Promise<void> {
  const ids = await claimIdsForJourney(claimId, journey);
  const selection = { columns: { id: true } } as const;
  const [claimRows, draftRows, eventRows, historyRows, notificationRows, auditRows] =
    await Promise.all([
      ids.length
        ? db.query.claims.findMany({
            ...selection,
            where: and(eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId), inArray(claims.id, ids)),
          })
        : [],
      db.query.freeStartDrafts.findMany({
        ...selection,
        where: and(
          eq(freeStartDrafts.tenantId, E2E_USERS.KS_MEMBER.tenantId),
          eq(freeStartDrafts.summary, journey.summary)
        ),
      }),
      ids.length
        ? db.query.domainEvents.findMany({
            ...selection,
            where: and(
              inArray(domainEvents.entityId, ids),
              eq(domainEvents.tenantId, E2E_USERS.KS_MEMBER.tenantId)
            ),
          })
        : [],
      ids.length
        ? db.query.claimStageHistory.findMany({
            ...selection,
            where: and(
              eq(claimStageHistory.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              inArray(claimStageHistory.claimId, ids)
            ),
          })
        : [],
      ids.length
        ? db.query.notifications.findMany({
            ...selection,
            where: and(
              eq(notifications.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              inArray(
                notifications.actionUrl,
                ids.map(id => `/member/claims/${id}`)
              )
            ),
          })
        : [],
      ids.length
        ? db.query.auditLog.findMany({
            ...selection,
            where: and(
              eq(auditLog.tenantId, E2E_USERS.KS_MEMBER.tenantId),
              inArray(auditLog.entityId, ids)
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
