import { enforceRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

import { authorizeCronRequest } from '../_auth';
import { type DunningCronStats, runDunningCronCore } from './_core';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/cron/dunning',
    limit: 10,
    windowSeconds: 60,
    headers: req.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const ingress = authorizeCronRequest({ authorizationHeader: req.headers.get('authorization') });
  if (!ingress) {
    console.error('[Dunning Cron] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let stats: DunningCronStats = {
    checked: 0,
    day7Sent: 0,
    day13Sent: 0,
    errors: 0,
  };

  try {
    const result = await runDunningCronCore({ ingress, now, headers: req.headers });
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
