import { logAuditEvent } from '@/lib/audit';
import { getDayWindow } from '@/lib/cron/engagement-schedule';
import { sendNpsSurveyEmail } from '@/lib/email';
import { db } from '@interdomestik/database';
import {
  engagementEmailSends,
  npsSurveyTokens,
  subscriptions,
  user,
} from '@interdomestik/database/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const NPS_TEMPLATE_KEY = 'nps_v1';
const NPS_DAYS_SINCE_SUB_CREATED = 45;
const TOKEN_TTL_DAYS = 30;

export type NpsCronResults = {
  sent: number;
  skipped: number;
  errors: number;
};

export async function runNpsCronCore(args: {
  now: Date;
  headers: Headers;
}): Promise<NpsCronResults> {
  const { now, headers } = args;

  const results: NpsCronResults = {
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const { start, end } = getDayWindow(now, NPS_DAYS_SINCE_SUB_CREATED);

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
    const dedupeKey = `engagement:${member.subId}:${NPS_TEMPLATE_KEY}`;

    const inserted = await db
      .insert(engagementEmailSends)
      .values({
        id: nanoid(),
        tenantId: member.tenantId!,
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

    await db
      .insert(npsSurveyTokens)
      .values({
        id: nanoid(),
        tenantId: member.tenantId!,
        userId: member.userId!,
        subscriptionId: member.subId,
        dedupeKey,
        token,
        createdAt: new Date(),
        expiresAt,
        usedAt: null,
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
          tenantId: member.tenantId,
          action: 'email.nps.sent',
          entityType: 'subscription',
          entityId: member.subId,
          metadata: { templateKey: NPS_TEMPLATE_KEY },
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
          action: 'email.nps.failed',
          entityType: 'subscription',
          entityId: member.subId,
          metadata: { templateKey: NPS_TEMPLATE_KEY, error: err },
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

  await logAuditEvent({
    actorId: null,
    actorRole: 'system',
    action: 'cron.nps.run',
    entityType: 'cron',
    entityId: 'nps',
    metadata: results,
    headers,
  });

  return results;
}
