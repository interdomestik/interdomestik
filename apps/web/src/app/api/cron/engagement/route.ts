import { logAuditEvent } from '@/lib/audit';
import {
  sendCheckinEmail,
  sendEngagementDay30Email,
  sendEngagementDay60Email,
  sendEngagementDay90Email,
  sendOnboardingEmail,
  sendSeasonalEmail,
} from '@/lib/email';
import { enforceRateLimit } from '@/lib/rate-limit';
import { db } from '@interdomestik/database';
import { engagementEmailSends, subscriptions, user } from '@interdomestik/database/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

import { ENGAGEMENT_CADENCE, getDayWindow } from '@/lib/cron/engagement-schedule';

// Auth header required:
//   Authorization: Bearer $CRON_SECRET
// Secure the cron job
function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isDevelopment = process.env.NODE_ENV !== 'production';
  const allowDevBypass = process.env.CRON_BYPASS_SECRET_IN_DEV === 'true';
  if (isDevelopment && allowDevBypass) return true;

  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/cron/engagement',
    limit: 10,
    windowSeconds: 60,
    headers: request.headers,
  });
  if (limited) return limited;

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const results = {
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

  try {
    // ========================================================================
    // Lifecycle engagement cadence: Day 7/14/30/60/90 (idempotent)
    // ========================================================================
    for (const cadence of ENGAGEMENT_CADENCE) {
      const { start, end } = getDayWindow(now, cadence.daysSinceSubscriptionCreated);

      const members = await db
        .select({
          userId: subscriptions.userId,
          subId: subscriptions.id,
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
              action: 'email.engagement.sent',
              entityType: 'subscription',
              entityId: member.subId,
              metadata: { templateKey },
              headers: request.headers,
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
              action: 'email.engagement.failed',
              entityType: 'subscription',
              entityId: member.subId,
              metadata: { templateKey, error: err },
              headers: request.headers,
            });
          }
        } catch (error) {
          results.errors++;
          await db
            .update(engagementEmailSends)
            .set({
              status: 'error',
              error: 'Unhandled exception during send',
            })
            .where(eq(engagementEmailSends.dedupeKey, dedupeKey));
          console.error('Engagement email send error:', error);
        }
      }
    }

    // ========================================================================
    // ========================================================================
    // Seasonal (Winter/Summer) - Runs on specific dates
    // ========================================================================
    // ========================================================================
    const month = now.getMonth(); // 0-11
    const day = now.getDate();
    let season: 'winter' | 'summer' | null = null;

    // Run Winter campaign on Nov 1st
    if (month === 10 && day === 1) season = 'winter';
    // Run Summer campaign on June 1st
    if (month === 5 && day === 1) season = 'summer';

    if (season) {
      const seasonalMembers = await db
        .select({
          userId: subscriptions.userId,
          subId: subscriptions.id,
          name: user.name,
          email: user.email,
        })
        .from(subscriptions)
        .innerJoin(user, eq(subscriptions.userId, user.id))
        .where(and(eq(subscriptions.status, 'active')))
        .limit(100); // Batch limit to avoid timeouts

      for (const member of seasonalMembers) {
        if (member.email && member.name) {
          await sendSeasonalEmail(member.email, { season, name: member.name });
          results.seasonal++;
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
      headers: request.headers,
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
