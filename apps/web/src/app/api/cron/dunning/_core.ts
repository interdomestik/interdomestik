import { sendPaymentFinalWarningEmail, sendPaymentReminderEmail } from '@/lib/email';
import { db, subscriptions, user } from '@interdomestik/database';
import { and, eq, gt } from 'drizzle-orm';

export type DunningCronStats = {
  checked: number;
  day7Sent: number;
  day13Sent: number;
  errors: number;
};

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

    for (const sub of pastDueSubscriptions) {
      if (!sub.gracePeriodEndsAt || !sub.pastDueAt) continue;

      const msRemaining = sub.gracePeriodEndsAt.getTime() - now.getTime();
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

      const msSinceFailed = now.getTime() - sub.pastDueAt.getTime();
      const daysSinceFailed = Math.floor(msSinceFailed / (1000 * 60 * 60 * 24));

      let emailToSend: 'day7' | 'day13' | null = null;

      if (
        daysRemaining >= 6 &&
        daysRemaining <= 8 &&
        daysSinceFailed >= 6 &&
        daysSinceFailed <= 8
      ) {
        emailToSend = 'day7';
      } else if (daysRemaining >= 0 && daysRemaining <= 2 && daysSinceFailed >= 12) {
        emailToSend = 'day13';
      }

      if (!emailToSend) continue;

      try {
        const userRecord = await db.query.user.findFirst({
          where: eq(user.id, sub.userId),
        });

        if (!userRecord?.email) continue;

        const emailParams = {
          memberName: userRecord.name || 'Member',
          planName: sub.planId || 'Membership',
          gracePeriodEndDate: sub.gracePeriodEndsAt.toLocaleDateString(),
          daysRemaining,
        };

        if (emailToSend === 'day7') {
          await sendPaymentReminderEmail(userRecord.email, emailParams);
          stats.day7Sent++;
        } else if (emailToSend === 'day13') {
          await sendPaymentFinalWarningEmail(userRecord.email, emailParams);
          stats.day13Sent++;
        }

        await db
          .update(subscriptions)
          .set({ lastDunningAt: now })
          .where(eq(subscriptions.id, sub.id));

        await logAuditEvent({
          actorId: null,
          actorRole: 'system',
          tenantId: sub.tenantId,
          action: emailToSend === 'day7' ? 'email.dunning.reminder' : 'email.dunning.final_warning',
          entityType: 'subscription',
          entityId: sub.id,
          metadata: {
            emailToSend,
            daysRemaining,
            daysSinceFailed,
          },
          headers,
        });
      } catch {
        stats.errors++;
      }
    }

    afterId = pastDueSubscriptions[pastDueSubscriptions.length - 1]?.id ?? afterId;
  }

  return { stats };
}
