import { sendCheckinEmail, sendOnboardingEmail, sendSeasonalEmail } from '@/lib/email';
import { enforceRateLimit } from '@/lib/rate-limit';
import { db } from '@interdomestik/database';
import { automationLogs, subscriptions, user } from '@interdomestik/database/schema';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

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
    onboarding: 0,
    checkin: 0,
    seasonal: 0,
    annual: 0,
  };

  try {
    // ========================================================================
    // 1. Day 3: Onboarding (Download App/Card)
    // ========================================================================
    const day3Start = new Date(now);
    day3Start.setDate(day3Start.getDate() - 3);
    const day3End = new Date(day3Start);
    day3End.setHours(day3End.getHours() + 24); // Loose window to catch any from that day

    // Find active subscriptions created ~3 days ago that haven't received onboarding email
    const newMembers = await db
      .select({
        userId: subscriptions.userId,
        subId: subscriptions.id,
        name: user.name,
        email: user.email,
      })
      .from(subscriptions)
      .innerJoin(user, eq(subscriptions.userId, user.id))
      .leftJoin(
        automationLogs,
        and(
          eq(automationLogs.subscriptionId, subscriptions.id),
          eq(automationLogs.type, 'onboarding')
        )
      )
      .where(
        and(
          eq(subscriptions.status, 'active'),
          gte(subscriptions.createdAt, day3Start),
          lte(subscriptions.createdAt, day3End),
          isNull(automationLogs.id) // Not sent yet
        )
      );

    for (const member of newMembers) {
      if (member.email && member.name) {
        await sendOnboardingEmail(member.email, member.name);
        await db.insert(automationLogs).values({
          id: nanoid(),
          userId: member.userId!,
          subscriptionId: member.subId,
          type: 'onboarding',
          triggeredAt: new Date(),
        });
        results.onboarding++;
      }
    }

    // ========================================================================
    // 2. Day 14: Check-in
    // ========================================================================
    const day14Start = new Date(now);
    day14Start.setDate(day14Start.getDate() - 14);
    const day14End = new Date(day14Start);
    day14End.setHours(day14End.getHours() + 24);

    const checkinMembers = await db
      .select({
        userId: subscriptions.userId,
        subId: subscriptions.id,
        name: user.name,
        email: user.email,
      })
      .from(subscriptions)
      .innerJoin(user, eq(subscriptions.userId, user.id))
      .leftJoin(
        automationLogs,
        and(eq(automationLogs.subscriptionId, subscriptions.id), eq(automationLogs.type, 'checkin'))
      )
      .where(
        and(
          eq(subscriptions.status, 'active'),
          gte(subscriptions.createdAt, day14Start),
          lte(subscriptions.createdAt, day14End),
          isNull(automationLogs.id)
        )
      );

    for (const member of checkinMembers) {
      if (member.email && member.name) {
        await sendCheckinEmail(member.email, member.name);
        await db.insert(automationLogs).values({
          id: nanoid(),
          userId: member.userId!,
          subscriptionId: member.subId,
          type: 'checkin',
          triggeredAt: new Date(),
        });
        results.checkin++;
      }
    }

    // ========================================================================
    // 3. Seasonal (Winter/Summer) - Runs on specific dates
    // ========================================================================
    const month = now.getMonth(); // 0-11
    const day = now.getDate();
    let season: 'winter' | 'summer' | null = null;

    // Run Winter campaign on Nov 1st
    if (month === 10 && day === 1) season = 'winter';
    // Run Summer campaign on June 1st
    if (month === 5 && day === 1) season = 'summer';

    if (season) {
      // Find all active members who haven't received THIS season's email THIS year
      const campaignKey = `seasonal_${season}_${now.getFullYear()}`;

      const seasonalMembers = await db
        .select({
          userId: subscriptions.userId,
          subId: subscriptions.id,
          name: user.name,
          email: user.email,
        })
        .from(subscriptions)
        .innerJoin(user, eq(subscriptions.userId, user.id))
        .leftJoin(
          automationLogs,
          and(
            eq(automationLogs.subscriptionId, subscriptions.id),
            eq(automationLogs.type, campaignKey)
          )
        )
        .where(and(eq(subscriptions.status, 'active'), isNull(automationLogs.id)))
        .limit(100); // Batch limit to avoid timeouts

      for (const member of seasonalMembers) {
        if (member.email && member.name) {
          await sendSeasonalEmail(member.email, { season, name: member.name });
          await db.insert(automationLogs).values({
            id: nanoid(),
            userId: member.userId!,
            subscriptionId: member.subId,
            type: campaignKey,
            triggeredAt: new Date(),
          });
          results.seasonal++;
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
