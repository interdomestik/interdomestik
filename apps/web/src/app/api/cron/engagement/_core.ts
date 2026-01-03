import { logAuditEvent } from '@/lib/audit';
import {
  sendCheckinEmail,
  sendEngagementDay30Email,
  sendEngagementDay60Email,
  sendEngagementDay90Email,
  sendOnboardingEmail,
  sendSeasonalEmail,
} from '@/lib/email';
import { db } from '@interdomestik/database';
import { engagementEmailSends, subscriptions, user } from '@interdomestik/database/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { ENGAGEMENT_CADENCE, getDayWindow } from '@/lib/cron/engagement-schedule';

export type EngagementCronResults = {
  day7: number;
  day14: number;
  day30: number;
  day60: number;
  day90: number;
  seasonal: number;
  annual: number;
  skipped: number;
  errors: number;
};

export async function runEngagementCronCore(args: {
  now: Date;
  headers: Headers;
}): Promise<EngagementCronResults> {
  const { now, headers } = args;

  const results: EngagementCronResults = {
    day7: 0,
    day14: 0,
    day30: 0,
    day60: 0,
    day90: 0,
    seasonal: 0,
    annual: 0,
    skipped: 0,
    errors: 0,
  };

  // Lifecycle engagement cadence: Day 7/14/30/60/90 (idempotent)
  for (const cadence of ENGAGEMENT_CADENCE) {
    const { start, end } = getDayWindow(now, cadence.daysSinceSubscriptionCreated);

    const members = await db
      .select({
        userId: subscriptions.userId,
        subId: subscriptions.id,
        tenantId: subscriptions.tenantId,
        name: user.name,
        email: user.email,
      })
      .from(subscriptions)
      .innerJoin(user, eq(subscriptions.userId, user.id))
      .where(
        and(
          eq(subscriptions.status, 'active'),
          gte(subscriptions.createdAt, start),
          lte(subscriptions.createdAt, end)
        )
      )
      .limit(200);

    for (const member of members) {
      const templateKey = cadence.templateKey;
      const dedupeKey = `engagement:${member.subId}:${templateKey}`;

      const inserted = await db
        .insert(engagementEmailSends)
        .values({
          id: nanoid(),
          tenantId: member.tenantId!,
          userId: member.userId!,
          subscriptionId: member.subId,
          templateKey,
          dedupeKey,
          status: 'pending',
          createdAt: new Date(),
          metadata: {
            scheduledDays: cadence.daysSinceSubscriptionCreated,
          },
        })
        .onConflictDoNothing({ target: engagementEmailSends.dedupeKey })
        .returning({ id: engagementEmailSends.id });

      if (inserted.length === 0) continue;

      if (!member.email || !member.name) {
        await db
          .update(engagementEmailSends)
          .set({
            status: 'skipped',
            error: 'Missing recipient email or name',
          })
          .where(eq(engagementEmailSends.dedupeKey, dedupeKey));
        results.skipped++;
        continue;
      }

      let sendResult: { success: true; id?: string } | { success: false; error?: string } = {
        success: false,
      };

      try {
        if (templateKey === 'onboarding') {
          sendResult = await sendOnboardingEmail(member.email, member.name);
          results.day7++;
        } else if (templateKey === 'checkin') {
          sendResult = await sendCheckinEmail(member.email, member.name);
          results.day14++;
        } else if (templateKey === 'day30') {
          sendResult = await sendEngagementDay30Email(member.email, member.name);
          results.day30++;
        } else if (templateKey === 'day60') {
          sendResult = await sendEngagementDay60Email(member.email, member.name);
          results.day60++;
        } else if (templateKey === 'day90') {
          sendResult = await sendEngagementDay90Email(member.email, member.name);
          results.day90++;
        }

        if (sendResult.success) {
          await db
            .update(engagementEmailSends)
            .set({
              status: 'sent',
              providerMessageId: sendResult.id || null,
              sentAt: new Date(),
            })
            .where(eq(engagementEmailSends.dedupeKey, dedupeKey));

          await logAuditEvent({
            actorId: null,
            actorRole: 'system',
            tenantId: member.tenantId,
            action: 'email.engagement.sent',
            entityType: 'subscription',
            entityId: member.subId,
            metadata: { templateKey },
            headers,
          });
        } else {
          const err = sendResult.error || 'Unknown error';
          const status = err === 'Resend not configured' ? 'skipped' : 'error';

          await db
            .update(engagementEmailSends)
            .set({
              status,
              error: err,
            })
            .where(eq(engagementEmailSends.dedupeKey, dedupeKey));

          if (status === 'skipped') results.skipped++;
          else results.errors++;

          await logAuditEvent({
            actorId: null,
            actorRole: 'system',
            tenantId: member.tenantId,
            action: 'email.engagement.failed',
            entityType: 'subscription',
            entityId: member.subId,
            metadata: { templateKey, error: err },
            headers,
          });
        }
      } catch {
        results.errors++;
        await db
          .update(engagementEmailSends)
          .set({
            status: 'error',
            error: 'Unhandled exception during send',
          })
          .where(eq(engagementEmailSends.dedupeKey, dedupeKey));
      }
    }
  }

  // Seasonal (Winter/Summer) - Runs on specific dates
  const month = now.getMonth();
  const day = now.getDate();
  let season: 'winter' | 'summer' | null = null;

  if (month === 10 && day === 1) season = 'winter';
  if (month === 5 && day === 1) season = 'summer';

  if (season) {
    const templateKey = `seasonal_${season}_${now.getFullYear()}`;

    const seasonalMembers = await db
      .select({
        userId: subscriptions.userId,
        subId: subscriptions.id,
        tenantId: subscriptions.tenantId,
        name: user.name,
        email: user.email,
      })
      .from(subscriptions)
      .innerJoin(user, eq(subscriptions.userId, user.id))
      .where(and(eq(subscriptions.status, 'active')))
      .limit(100);

    for (const member of seasonalMembers) {
      const dedupeKey = `engagement:${member.subId}:${templateKey}`;

      const inserted = await db
        .insert(engagementEmailSends)
        .values({
          id: nanoid(),
          tenantId: member.tenantId!,
          userId: member.userId!,
          subscriptionId: member.subId,
          templateKey,
          dedupeKey,
          status: 'pending',
          createdAt: new Date(),
          metadata: {
            season,
            year: now.getFullYear(),
          },
        })
        .onConflictDoNothing({ target: engagementEmailSends.dedupeKey })
        .returning({ id: engagementEmailSends.id });

      if (inserted.length === 0) continue;

      if (!member.email || !member.name) {
        await db
          .update(engagementEmailSends)
          .set({
            status: 'skipped',
            error: 'Missing recipient email or name',
          })
          .where(eq(engagementEmailSends.dedupeKey, dedupeKey));
        results.skipped++;
        continue;
      }

      try {
        const sendResult = await sendSeasonalEmail(member.email, { season, name: member.name });

        if (sendResult.success) {
          await db
            .update(engagementEmailSends)
            .set({
              status: 'sent',
              providerMessageId: sendResult.id || null,
              sentAt: new Date(),
            })
            .where(eq(engagementEmailSends.dedupeKey, dedupeKey));

          results.seasonal++;

          await logAuditEvent({
            actorId: null,
            actorRole: 'system',
            tenantId: member.tenantId,
            action: 'email.engagement.sent',
            entityType: 'subscription',
            entityId: member.subId,
            metadata: { templateKey },
            headers,
          });
        } else {
          const err = sendResult.error || 'Unknown error';
          const status = err === 'Resend not configured' ? 'skipped' : 'error';

          await db
            .update(engagementEmailSends)
            .set({
              status,
              error: err,
            })
            .where(eq(engagementEmailSends.dedupeKey, dedupeKey));

          if (status === 'skipped') results.skipped++;
          else results.errors++;

          await logAuditEvent({
            actorId: null,
            actorRole: 'system',
            tenantId: member.tenantId,
            action: 'email.engagement.failed',
            entityType: 'subscription',
            entityId: member.subId,
            metadata: { templateKey, error: err },
            headers,
          });
        }
      } catch {
        results.errors++;
        await db
          .update(engagementEmailSends)
          .set({
            status: 'error',
            error: 'Unhandled exception during send',
          })
          .where(eq(engagementEmailSends.dedupeKey, dedupeKey));
      }
    }
  }

  await logAuditEvent({
    actorId: null,
    actorRole: 'system',
    action: 'cron.engagement.run',
    entityType: 'cron',
    entityId: 'engagement',
    metadata: results,
    headers,
  });

  return results;
}
