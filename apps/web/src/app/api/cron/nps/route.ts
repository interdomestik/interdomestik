import { logAuditEvent } from '@/lib/audit';
import { sendNpsSurveyEmail } from '@/lib/email';
import { getDayWindow } from '@/lib/cron/engagement-schedule';
import { enforceRateLimit } from '@/lib/rate-limit';
import { db } from '@interdomestik/database';
import {
  engagementEmailSends,
  npsSurveyTokens,
  subscriptions,
  user,
} from '@interdomestik/database/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isDevelopment = process.env.NODE_ENV !== 'production';
  const allowDevBypass = process.env.CRON_BYPASS_SECRET_IN_DEV === 'true';
  if (isDevelopment && allowDevBypass) return true;

  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

const NPS_TEMPLATE_KEY = 'nps_v1';
const NPS_DAYS_SINCE_SUB_CREATED = 45;
const TOKEN_TTL_DAYS = 30;

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/cron/nps',
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
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const { start, end } = getDayWindow(now, NPS_DAYS_SINCE_SUB_CREATED);

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
      const dedupeKey = `engagement:${member.subId}:${NPS_TEMPLATE_KEY}`;

      const inserted = await db
        .insert(engagementEmailSends)
        .values({
          id: nanoid(),
          userId: member.userId!,
          subscriptionId: member.subId,
          templateKey: NPS_TEMPLATE_KEY,
          dedupeKey,
          status: 'pending',
          createdAt: new Date(),
          metadata: {
            scheduledDays: NPS_DAYS_SINCE_SUB_CREATED,
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

      const token = nanoid(32);
      const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      // Create (or reuse) token for this dedupe key
      await db
        .insert(npsSurveyTokens)
        .values({
          id: nanoid(),
          userId: member.userId!,
          subscriptionId: member.subId,
          dedupeKey,
          token,
          createdAt: new Date(),
          expiresAt,
          metadata: {
            templateKey: NPS_TEMPLATE_KEY,
          },
        })
        .onConflictDoNothing({ target: npsSurveyTokens.dedupeKey });

      const [tokenRow] = await db
        .select({ token: npsSurveyTokens.token })
        .from(npsSurveyTokens)
        .where(eq(npsSurveyTokens.dedupeKey, dedupeKey))
        .limit(1);

      const surveyToken = tokenRow?.token;
      if (!surveyToken) {
        await db
          .update(engagementEmailSends)
          .set({ status: 'error', error: 'Failed to create NPS token' })
          .where(eq(engagementEmailSends.dedupeKey, dedupeKey));
        results.errors++;
        continue;
      }

      try {
        const sendResult = await sendNpsSurveyEmail(member.email, {
          name: member.name,
          token: surveyToken,
        });

        if (sendResult.success) {
          await db
            .update(engagementEmailSends)
            .set({
              status: 'sent',
              providerMessageId: sendResult.id || null,
              sentAt: new Date(),
            })
            .where(eq(engagementEmailSends.dedupeKey, dedupeKey));

          results.sent++;

          await logAuditEvent({
            actorId: null,
            actorRole: 'system',
            action: 'email.nps.sent',
            entityType: 'subscription',
            entityId: member.subId,
            metadata: { templateKey: NPS_TEMPLATE_KEY },
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
            action: 'email.nps.failed',
            entityType: 'subscription',
            entityId: member.subId,
            metadata: { templateKey: NPS_TEMPLATE_KEY, error: err },
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
        console.error('NPS email send error:', error);
      }
    }

    await logAuditEvent({
      actorId: null,
      actorRole: 'system',
      action: 'cron.nps.run',
      entityType: 'cron',
      entityId: 'nps',
      metadata: results,
      headers: request.headers,
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Cron NPS error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
