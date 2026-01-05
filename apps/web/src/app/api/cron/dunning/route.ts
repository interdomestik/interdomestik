import { enforceRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

import { authorizeCronRequest } from '../_auth';
import { type DunningCronStats, runDunningCronCore } from './_core';

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
 *
 * Auth header required:
 *   Authorization: Bearer $CRON_SECRET
 */

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/cron/dunning',
    limit: 10,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;

  if (
    !authorizeCronRequest({
      authorizationHeader: req.headers.get('authorization'),
      cronSecret: process.env.CRON_SECRET,
    })
  ) {
    console.error('[Dunning Cron] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Dunning Cron] Starting daily dunning check...');

  const now = new Date();
  let stats: DunningCronStats = {
    checked: 0,
    day7Sent: 0,
    day13Sent: 0,
    errors: 0,
  };

  try {
    const result = await runDunningCronCore({ now, headers: req.headers });
    stats = result.stats;

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
