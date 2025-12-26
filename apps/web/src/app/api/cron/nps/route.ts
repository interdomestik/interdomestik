import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

import { authorizeCronRequest } from '../_auth';
import { runNpsCronCore } from './_core';

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/cron/nps',
    limit: 10,
    windowSeconds: 60,
    headers: request.headers,
  });
  if (limited) return limited;

  if (
    !authorizeCronRequest({
      authorizationHeader: request.headers.get('authorization'),
      cronSecret: process.env.CRON_SECRET,
      nodeEnv: process.env.NODE_ENV,
      allowDevBypass: process.env.CRON_BYPASS_SECRET_IN_DEV === 'true',
    })
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  try {
    const results = await runNpsCronCore({ now, headers: request.headers });
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Cron NPS error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
