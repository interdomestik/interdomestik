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

  await processLifecycleEngagement(now, headers, results);
  await processSeasonalEngagement(now, headers, results);

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

async function processLifecycleEngagement(
  now: Date,
  headers: Headers,
  results: EngagementCronResults
) {
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
      await processMemberEngagement(member, cadence, results, headers);
    }
  }
}

async function processMemberEngagement(
  member: any,
  cadence: any,
  results: EngagementCronResults,
  headers: Headers
) {
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

  if (inserted.length === 0) return;

  if (!member.email || !member.name) {
    await markAsSkipped(dedupeKey, 'Missing recipient email or name');
    results.skipped++;
    return;
  }

  try {
    const sendResult = await sendEngagementEmail(templateKey, member);
    await handleSendResult(sendResult, dedupeKey, member, templateKey, results, headers);
  } catch {
    results.errors++;
    await markAsError(dedupeKey, 'Unhandled exception during send');
  }
}

async function sendEngagementEmail(templateKey: string, member: any) {
  if (templateKey === 'onboarding') return await sendOnboardingEmail(member.email, member.name);
  if (templateKey === 'checkin') return await sendCheckinEmail(member.email, member.name);
  if (templateKey === 'day30') return await sendEngagementDay30Email(member.email, member.name);
  if (templateKey === 'day60') return await sendEngagementDay60Email(member.email, member.name);
  if (templateKey === 'day90') return await sendEngagementDay90Email(member.email, member.name);
  return { success: false, error: 'Unknown template' };
}

async function processSeasonalEngagement(
  now: Date,
  headers: Headers,
  results: EngagementCronResults
) {
  const month = now.getMonth();
  const day = now.getDate();
  let season: 'winter' | 'summer' | null = null;

  if (month === 10 && day === 1) season = 'winter';
  if (month === 5 && day === 1) season = 'summer';

  if (!season) return;

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
    await processSeasonalMember(member, season, templateKey, now, results, headers);
  }
}

async function processSeasonalMember(
  member: any,
  season: string,
  templateKey: string,
  now: Date,
  results: EngagementCronResults,
  headers: Headers
) {
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

  if (inserted.length === 0) return;

  if (!member.email || !member.name) {
    await markAsSkipped(dedupeKey, 'Missing recipient email or name');
    results.skipped++;
    return;
  }

  try {
    const sendResult = await sendSeasonalEmail(member.email, {
      season: season as any,
      name: member.name,
    });
    await handleSendResult(
      sendResult,
      dedupeKey,
      member,
      templateKey,
      results,
      headers,
      true // isSeasonal
    );
  } catch {
    results.errors++;
    await markAsError(dedupeKey, 'Unhandled exception during send');
  }
}

async function handleSendResult(
  sendResult: any,
  dedupeKey: string,
  member: any,
  templateKey: string,
  results: EngagementCronResults,
  headers: Headers,
  isSeasonal = false
) {
  if (sendResult.success) {
    await db
      .update(engagementEmailSends)
      .set({
        status: 'sent',
        providerMessageId: sendResult.id || null,
        sentAt: new Date(),
      })
      .where(eq(engagementEmailSends.dedupeKey, dedupeKey));

    // Update counters
    if (isSeasonal) results.seasonal++;
    else if (templateKey === 'onboarding') results.day7++;
    else if (templateKey === 'checkin') results.day14++;
    else if (templateKey === 'day30') results.day30++;
    else if (templateKey === 'day60') results.day60++;
    else if (templateKey === 'day90') results.day90++;

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
      .set({ status, error: err })
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
}

async function markAsSkipped(dedupeKey: string, reason: string) {
  await db
    .update(engagementEmailSends)
    .set({ status: 'skipped', error: reason })
    .where(eq(engagementEmailSends.dedupeKey, dedupeKey));
}

async function markAsError(dedupeKey: string, reason: string) {
  await db
    .update(engagementEmailSends)
    .set({ status: 'error', error: reason })
    .where(eq(engagementEmailSends.dedupeKey, dedupeKey));
}
