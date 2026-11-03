import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

import { authorizeCronRequest } from '../_auth';
import { runEngagementCronCore } from './_core';

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/cron/engagement',
    limit: 10,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const ingress = authorizeCronRequest({
    authorizationHeader: request.headers.get('authorization'),
  });
  if (!ingress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  try {
    const results = await runEngagementCronCore({ ingress, now, headers: request.headers });
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
