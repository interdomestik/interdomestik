import { logAuditEvent } from '@/lib/audit';
import { sendPaymentFinalWarningEmail, sendPaymentReminderEmail } from '@/lib/email';
import { db, subscriptions, user } from '@interdomestik/database';
import { and, eq, gt } from 'drizzle-orm';

export type DunningCronStats = {
  checked: number;
  day7Sent: number;
  day13Sent: number;
  errors: number;
};

type SubscriptionRecord = Awaited<ReturnType<typeof db.query.subscriptions.findMany>>[number];

export async function runDunningCronCore(args: {
  now: Date;
  headers: Headers;
}): Promise<{ stats: DunningCronStats }> {
  const { now, headers } = args;

  const stats: DunningCronStats = {
    checked: 0,
    day7Sent: 0,
    day13Sent: 0,
    errors: 0,
  };

  let afterId: string | null = null;

  while (true) {
    const conditions = [
      eq(subscriptions.status, 'past_due'),
      gt(subscriptions.gracePeriodEndsAt, now),
    ];
    if (afterId) {
      conditions.push(gt(subscriptions.id, afterId));
    }

    const pastDueSubscriptions = await db.query.subscriptions.findMany({
      where: and(...conditions),
      orderBy: (subscriptions, { asc }) => [asc(subscriptions.id)],
      limit: 200,
    });

    if (pastDueSubscriptions.length === 0) break;

    stats.checked += pastDueSubscriptions.length;

    await processBatch({
      subscriptions: pastDueSubscriptions as (SubscriptionRecord & {
        gracePeriodEndsAt: Date;
        pastDueAt: Date;
      })[],
      now,
      headers,
      stats,
    });

    afterId = pastDueSubscriptions[pastDueSubscriptions.length - 1]?.id ?? afterId;
  }

  return { stats };
}

async function processBatch(params: {
  subscriptions: (SubscriptionRecord & { gracePeriodEndsAt: Date; pastDueAt: Date })[];
  now: Date;
  headers: Headers;
  stats: DunningCronStats;
}) {
  const { subscriptions, now, headers, stats } = params;
  for (const sub of subscriptions) {
    if (!sub.gracePeriodEndsAt || !sub.pastDueAt) continue;
    try {
      await processDunningSubscription({ sub, now, headers, stats });
    } catch {
      stats.errors++;
    }
  }
}

async function processDunningSubscription(params: {
  sub: SubscriptionRecord & { gracePeriodEndsAt: Date; pastDueAt: Date };
  now: Date;
  headers: Headers;
  stats: DunningCronStats;
}) {
  const { sub, now, headers, stats } = params;
  const daysRemaining = calculateDaysDiff(sub.gracePeriodEndsAt, now);
  const daysSinceFailed = calculateDaysDiff(now, sub.pastDueAt);

  const emailType = determineDunningEmailType(daysRemaining, daysSinceFailed);
  if (!emailType) return;

  const userRecord = await db.query.user.findFirst({
    where: eq(user.id, sub.userId),
  });

  if (!userRecord?.email) return;

  await sendDunningEmail({
    email: userRecord.email,
    userName: userRecord.name,
    sub,
    daysRemaining,
    emailType,
  });

  if (emailType === 'day7') stats.day7Sent++;
  else if (emailType === 'day13') stats.day13Sent++;

  await db.update(subscriptions).set({ lastDunningAt: now }).where(eq(subscriptions.id, sub.id));

  await logAuditEvent({
    actorId: null,
    actorRole: 'system',
    tenantId: sub.tenantId,
    action: emailType === 'day7' ? 'email.dunning.reminder' : 'email.dunning.final_warning',
    entityType: 'subscription',
    entityId: sub.id,
    metadata: {
      emailToSend: emailType,
      daysRemaining,
      daysSinceFailed,
    },
    headers,
  });
}

function calculateDaysDiff(dateA: Date, dateB: Date): number {
  const ms = dateA.getTime() - dateB.getTime();
  return ms > 0 ? Math.ceil(ms / (1000 * 60 * 60 * 24)) : Math.floor(ms / (1000 * 60 * 60 * 24));
}

function determineDunningEmailType(
  daysRemaining: number,
  daysSinceFailed: number
): 'day7' | 'day13' | null {
  if (daysRemaining >= 6 && daysRemaining <= 8 && daysSinceFailed >= 6 && daysSinceFailed <= 8) {
    return 'day7';
  }
  if (daysRemaining >= 0 && daysRemaining <= 2 && daysSinceFailed >= 12) {
    return 'day13';
  }
  return null;
}

async function sendDunningEmail(params: {
  email: string;
  userName: string | null;
  sub: SubscriptionRecord & { gracePeriodEndsAt: Date };
  daysRemaining: number;
  emailType: 'day7' | 'day13';
}) {
  const { email, userName, sub, daysRemaining, emailType } = params;
  const emailParams = {
    memberName: userName || 'Member',
    planName: sub.planId || 'Membership',
    gracePeriodEndDate: sub.gracePeriodEndsAt.toLocaleDateString(),
    daysRemaining,
  };

  if (emailType === 'day7') {
    await sendPaymentReminderEmail(email, emailParams);
  } else if (emailType === 'day13') {
    await sendPaymentFinalWarningEmail(email, emailParams);
  }
}
