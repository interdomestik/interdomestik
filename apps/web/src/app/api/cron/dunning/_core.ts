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
}): Promise<{ stats: DunningCronStats }> {
  const { now } = args;

  const stats: DunningCronStats = {
    checked: 0,
    day7Sent: 0,
    day13Sent: 0,
    errors: 0,
  };

  const pastDueSubscriptions = await db.query.subscriptions.findMany({
    where: and(eq(subscriptions.status, 'past_due'), gt(subscriptions.gracePeriodEndsAt, now)),
  });

  stats.checked = pastDueSubscriptions.length;

  for (const sub of pastDueSubscriptions) {
    if (!sub.gracePeriodEndsAt || !sub.pastDueAt) continue;

    const msRemaining = sub.gracePeriodEndsAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    const msSinceFailed = now.getTime() - sub.pastDueAt.getTime();
    const daysSinceFailed = Math.floor(msSinceFailed / (1000 * 60 * 60 * 24));

    let emailToSend: 'day7' | 'day13' | null = null;

    if (daysRemaining >= 6 && daysRemaining <= 8 && daysSinceFailed >= 6 && daysSinceFailed <= 8) {
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
    } catch {
      stats.errors++;
    }
  }

  return { stats };
}
