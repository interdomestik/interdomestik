import { db, subscriptions, user } from '@interdomestik/database';
import { and, eq, gt } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { sendPaymentFinalWarningEmail, sendPaymentReminderEmail } from '@/lib/email';

/**
 * DUNNING CRON JOB
 *
 * This endpoint should be called daily by a cron service (e.g., Vercel Cron, Railway Cron)
 * It checks for subscriptions in grace period and sends reminder emails:
 * - Day 7: 7 days remaining (send reminder)
 * - Day 13: 1 day remaining (send final warning)
 *
 * Cron schedule: 0 10 * * * (daily at 10:00 AM)
 *
 * Example vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/dunning",
 *     "schedule": "0 10 * * *"
 *   }]
 * }
 */

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(req: NextRequest): boolean {
  const secret = req.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  // In development, allow requests without secret
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return secret === `Bearer ${expectedSecret}`;
}

export async function GET(req: NextRequest) {
  // Verify request is from cron job
  if (!verifyCronSecret(req)) {
    console.error('[Dunning Cron] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Dunning Cron] Starting daily dunning check...');

  const now = new Date();
  const stats = {
    checked: 0,
    day7Sent: 0,
    day13Sent: 0,
    errors: 0,
  };

  try {
    // Find all past_due subscriptions in grace period
    const pastDueSubscriptions = await db.query.subscriptions.findMany({
      where: and(
        eq(subscriptions.status, 'past_due'),
        gt(subscriptions.gracePeriodEndsAt, now) // Still in grace period
      ),
    });

    console.log(`[Dunning Cron] Found ${pastDueSubscriptions.length} past_due subscriptions`);
    stats.checked = pastDueSubscriptions.length;

    for (const sub of pastDueSubscriptions) {
      if (!sub.gracePeriodEndsAt || !sub.pastDueAt) continue;

      // Calculate days remaining
      const msRemaining = sub.gracePeriodEndsAt.getTime() - now.getTime();
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

      // Calculate days since payment failed
      const msSinceFailed = now.getTime() - sub.pastDueAt.getTime();
      const daysSinceFailed = Math.floor(msSinceFailed / (1000 * 60 * 60 * 24));

      console.log(
        `[Dunning Cron] Sub ${sub.id}: ${daysRemaining} days remaining, ${daysSinceFailed} days since failure`
      );

      // Determine which email to send
      let emailToSend: 'day7' | 'day13' | null = null;

      // Day 7 reminder: 7 days remaining (around 6-8 days to be safe)
      if (
        daysRemaining >= 6 &&
        daysRemaining <= 8 &&
        daysSinceFailed >= 6 &&
        daysSinceFailed <= 8
      ) {
        emailToSend = 'day7';
      }
      // Day 13 final warning: 1 day remaining
      else if (daysRemaining >= 0 && daysRemaining <= 2 && daysSinceFailed >= 12) {
        emailToSend = 'day13';
      }

      if (!emailToSend) continue;

      try {
        // Fetch user info
        const userRecord = await db.query.user.findFirst({
          where: eq(user.id, sub.userId),
        });

        if (!userRecord?.email) {
          console.warn(`[Dunning Cron] No email for user ${sub.userId}`);
          continue;
        }

        const emailParams = {
          memberName: userRecord.name || 'Member',
          planName: sub.planId || 'Membership',
          gracePeriodEndDate: sub.gracePeriodEndsAt.toLocaleDateString(),
          daysRemaining,
        };

        if (emailToSend === 'day7') {
          await sendPaymentReminderEmail(userRecord.email, emailParams);
          stats.day7Sent++;
          console.log(`[Dunning Cron] ✉️ Day 7 reminder sent to ${userRecord.email}`);
        } else if (emailToSend === 'day13') {
          await sendPaymentFinalWarningEmail(userRecord.email, emailParams);
          stats.day13Sent++;
          console.log(`[Dunning Cron] 🚨 Day 13 FINAL WARNING sent to ${userRecord.email}`);
        }

        // Update last dunning timestamp to track emails sent
        await db
          .update(subscriptions)
          .set({ lastDunningAt: now })
          .where(eq(subscriptions.id, sub.id));
      } catch (emailError) {
        console.error(`[Dunning Cron] Email error for ${sub.id}:`, emailError);
        stats.errors++;
      }
    }

    console.log('[Dunning Cron] Completed:', stats);

    return NextResponse.json({
      success: true,
      stats,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[Dunning Cron] Error:', error);
    return NextResponse.json({ error: 'Internal server error', stats }, { status: 500 });
  }
}
