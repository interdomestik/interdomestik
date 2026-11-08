import { enforceRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

import { authorizeCronRequest } from '../_auth';
import { runSponsorCronCore } from './_core';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/cron/sponsors',
    limit: 10,
    windowSeconds: 60,
    headers: req.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const ingress = authorizeCronRequest({ authorizationHeader: req.headers.get('authorization') });
  if (!ingress) {
    console.error('[Sponsor Cron] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  try {
    const tenants = await runSponsorCronCore({ ingress, now });
    return NextResponse.json({ success: true, tenants, timestamp: now.toISOString() });
  } catch (error) {
    console.error('[Sponsor Cron] Error:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
