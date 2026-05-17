import { logAuditEvent } from '@/lib/audit';
import { getDayWindow } from '@/lib/cron/engagement-schedule';
import { sendNpsSurveyEmail } from '@/lib/email';
import { db, withTenantContext } from '@interdomestik/database';
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

  // db-access-guard: system-exempt -- reason: NPS cron enumerates tenants before per-row scoped writes
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

  // Process members in parallel chunks or sequential loop
  for (const member of members) {
    const status = await processNpsMember({
      member,
      now,
      headers,
    });
    results[status]++;
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

// Extracted helper to reduce cognitive complexity
async function processNpsMember(args: {
  member: {
    userId: string | null;
    subId: string;
    tenantId: string | null;
    name: string | null;
    email: string | null;
  };
  now: Date;
  headers: Headers;
}): Promise<'sent' | 'skipped' | 'errors'> {
  const { member, now, headers } = args;
  const dedupeKey = `engagement:${member.subId}:${NPS_TEMPLATE_KEY}`;

  if (!member.tenantId || !member.userId) return 'skipped';
  const tenantId = member.tenantId;
  const userId = member.userId;

  const inserted = await withTenantContext({ tenantId, role: 'system' }, tx =>
    tx
      .insert(engagementEmailSends)
      .values({
        id: nanoid(),
        tenantId,
        userId,
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
      .returning({ id: engagementEmailSends.id })
  );

  if (inserted.length === 0) return 'skipped'; // Already processed

  if (!member.email || !member.name) {
    await updateEngagementSend(tenantId, dedupeKey, {
      status: 'skipped',
      error: 'Missing recipient email or name',
    });
    return 'skipped';
  }

  const token = nanoid(32);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [tokenRow] = await withTenantContext({ tenantId, role: 'system' }, async tx => {
    await tx
      .insert(npsSurveyTokens)
      .values({
        id: nanoid(),
        tenantId,
        userId,
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

    return tx
      .select({ token: npsSurveyTokens.token })
      .from(npsSurveyTokens)
      .where(and(eq(npsSurveyTokens.dedupeKey, dedupeKey), eq(npsSurveyTokens.tenantId, tenantId)))
      .limit(1);
  });

  const surveyToken = tokenRow?.token;
  if (!surveyToken) {
    await updateEngagementSend(tenantId, dedupeKey, {
      status: 'error',
      error: 'Failed to create NPS token',
    });
    return 'errors';
  }

  try {
    const sendResult = await sendNpsSurveyEmail(member.email, {
      name: member.name,
      token: surveyToken,
    });

    if (sendResult.success) {
      await updateEngagementSend(tenantId, dedupeKey, {
        status: 'sent',
        providerMessageId: sendResult.id || null,
        sentAt: new Date(),
      });

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
      return 'sent';
    } else {
      const err = sendResult.error || 'Unknown error';
      // If "Resend not configured" (e.g. dev mode suppression), count as skipped
      const isSkipped = err === 'Resend not configured';
      const status = isSkipped ? 'skipped' : 'error';

      await updateEngagementSend(tenantId, dedupeKey, {
        status,
        error: err,
      });

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
      return isSkipped ? 'skipped' : 'errors';
    }
  } catch {
    await updateEngagementSend(tenantId, dedupeKey, {
      status: 'error',
      error: 'Unhandled exception during send',
    });
    return 'errors';
  }
}

async function updateEngagementSend(
  tenantId: string,
  dedupeKey: string,
  values: Partial<typeof engagementEmailSends.$inferInsert>
) {
  await withTenantContext({ tenantId, role: 'system' }, async tx => {
    await tx
      .update(engagementEmailSends)
      .set(values)
      .where(
        and(
          eq(engagementEmailSends.dedupeKey, dedupeKey),
          eq(engagementEmailSends.tenantId, tenantId)
        )
      );
  });
}
