import {
  sendAnnualReportEmail,
  sendCheckinEmail,
  sendOnboardingEmail,
  sendSeasonalEmail,
  sendWelcomeEmail,
} from '@/lib/email';
import { sendNotification } from '@/lib/notifications';
import { db } from '@interdomestik/database';
import { emailCampaignLogs } from '@interdomestik/database/schema';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function processEmailSequences() {
  const now = new Date();
  const logs = [];

  // 1. Day 0: Welcome Email
  const newSubscribers = await db.query.subscriptions.findMany({
    where: (subscriptions, { eq, and, gt }) =>
      and(eq(subscriptions.status, 'active'), gt(subscriptions.createdAt, subDays(now, 1))),
    with: {
      user: true,
    },
  });

  for (const sub of newSubscribers) {
    if (!sub.user?.email) continue;

    const alreadySent = await db.query.emailCampaignLogs.findFirst({
      where: and(
        eq(emailCampaignLogs.userId, sub.userId),
        eq(emailCampaignLogs.campaignId, 'welcome_day_0')
      ),
    });

    if (!alreadySent) {
      await sendWelcomeEmail(sub.user.email, sub.user.name);
      const insertWelcomeLog = {
        id: `ecl_${nanoid()}`,
        userId: sub.userId,
        campaignId: 'welcome_day_0',
        sentAt: new Date(),
      };
      await db.insert(emailCampaignLogs).values(insertWelcomeLog);
      logs.push(`Sent welcome_day_0 to ${sub.user.email}`);
    }
  }

  // 2. Day 3: Onboarding
  const windowStart = startOfDay(subDays(now, 3));
  const windowEnd = endOfDay(subDays(now, 3));

  const day3Users = await db.query.user.findMany({
    where: (user, { between }) => between(user.createdAt, windowStart, windowEnd),
  });

  for (const u of day3Users) {
    if (!u.email) continue;

    const alreadySent = await db.query.emailCampaignLogs.findFirst({
      where: and(
        eq(emailCampaignLogs.userId, u.id),
        eq(emailCampaignLogs.campaignId, 'onboarding_day_3')
      ),
    });

    if (!alreadySent) {
      await sendOnboardingEmail(u.email, u.name);
      const insertOnboardingLog = {
        id: `ecl_${nanoid()}`,
        userId: u.id,
        campaignId: 'onboarding_day_3',
        sentAt: new Date(),
      };
      await db.insert(emailCampaignLogs).values(insertOnboardingLog);
      logs.push(`Sent onboarding_day_3 to ${u.email}`);
    }
  }

  // 3. Day 14: Check-in
  const day14Start = startOfDay(subDays(now, 14));
  const day14End = endOfDay(subDays(now, 14));

  const day14Users = await db.query.user.findMany({
    where: (user, { between }) => between(user.createdAt, day14Start, day14End),
  });

  for (const u of day14Users) {
    if (!u.email) continue;

    const alreadySent = await db.query.emailCampaignLogs.findFirst({
      where: and(
        eq(emailCampaignLogs.userId, u.id),
        eq(emailCampaignLogs.campaignId, 'checkin_day_14')
      ),
    });

    if (!alreadySent) {
      await sendCheckinEmail(u.email, u.name);
      const insertCheckinLog = {
        id: `ecl_${nanoid()}`,
        userId: u.id,
        campaignId: 'checkin_day_14',
        sentAt: new Date(),
      };
      await db.insert(emailCampaignLogs).values(insertCheckinLog);
      logs.push(`Sent checkin_day_14 to ${u.email}`);
    }
  }

  return { processed: true, logs };
}

export async function processSeasonalCampaigns() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const logs = [];

  let season: 'winter' | 'summer' | null = null;
  let campaignId = '';

  if (month >= 9 && month <= 11) {
    season = 'winter';
    campaignId = `seasonal_winter_${year}`;
  } else if (month >= 4 && month <= 5) {
    season = 'summer';
    campaignId = `seasonal_summer_${year}`;
  }

  if (!season) return { processed: false, message: 'No active seasonal campaign' };

  const activeUsers = await db.query.user.findMany();

  for (const u of activeUsers) {
    if (!u.email) continue;

    const alreadySent = await db.query.emailCampaignLogs.findFirst({
      where: and(eq(emailCampaignLogs.userId, u.id), eq(emailCampaignLogs.campaignId, campaignId)),
    });

    if (!alreadySent) {
      await sendSeasonalEmail(u.email, { season, name: u.name });
      await sendNotification(
        u.id,
        'sla_warning',
        {},
        {
          title: season === 'winter' ? 'Winter Safety Check ❄️' : 'Summer Readiness ☀️',
          actionUrl: '/dashboard',
        }
      );

      const insertSeasonalLog = {
        id: `ecl_${nanoid()}`,
        userId: u.id,
        campaignId,
        sentAt: new Date(),
      };
      await db.insert(emailCampaignLogs).values(insertSeasonalLog);
      logs.push(`Sent ${campaignId} to ${u.email}`);
    }
  }

  return { processed: true, logs };
}

export async function processAnnualReports() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const logs = [];

  // Annual Reports trigger in December (11)
  if (month !== 11) return { processed: false, message: 'Annual reports only process in December' };

  const campaignId = `annual_report_${year}`;
  const activeUsers = await db.query.user.findMany();

  for (const u of activeUsers) {
    if (!u.email) continue;

    const alreadySent = await db.query.emailCampaignLogs.findFirst({
      where: and(eq(emailCampaignLogs.userId, u.id), eq(emailCampaignLogs.campaignId, campaignId)),
    });

    if (!alreadySent) {
      await sendAnnualReportEmail(u.email, u.name, year);
      await sendNotification(
        u.id,
        'sla_warning',
        {},
        {
          title: `Your ${year} Protection Summary is Ready! 🏆`,
          actionUrl: '/dashboard/wrapped',
        }
      );

      const insertAnnualLog = {
        id: `ecl_${nanoid()}`,
        userId: u.id,
        campaignId,
        sentAt: new Date(),
      };
      await db.insert(emailCampaignLogs).values(insertAnnualLog);
      logs.push(`Sent ${campaignId} to ${u.email}`);
    }
  }

  return { processed: true, logs };
}
