import { enforceRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

import { authorizeCronRequest } from '../../_auth';
import {
  assertNoCrmForecastSnapshotSchedulerPiiKeys,
  getCrmForecastSnapshotSchedulerStatus,
  logCrmForecastSnapshotSchedulerResult,
  runCrmForecastSnapshotSchedulerCore,
} from './_core';

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/cron/crm/forecast-snapshots',
    limit: 10,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  if (
    !authorizeCronRequest({
      authorizationHeader: request.headers.get('authorization'),
      cronSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCrmForecastSnapshotSchedulerCore({
      now: new Date(),
      requestedDate: request.nextUrl.searchParams.get('date'),
    });
    assertNoCrmForecastSnapshotSchedulerPiiKeys(result);
    const status = getCrmForecastSnapshotSchedulerStatus(result);
    logCrmForecastSnapshotSchedulerResult(result, status);

    return NextResponse.json({ result, success: status === 200 }, { status });
  } catch (error) {
    console.error('[CRM Forecast Snapshot Scheduler] route failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
