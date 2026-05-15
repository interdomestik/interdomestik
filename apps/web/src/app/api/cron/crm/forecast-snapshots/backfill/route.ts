import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/rate-limit';

import { authorizeCronRequest } from '../../../_auth';
import {
  CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE,
  CRM_FORECAST_SNAPSHOT_BACKFILL_RATE_LIMIT,
  CRM_FORECAST_SNAPSHOT_BACKFILL_RATE_LIMIT_WINDOW_SECONDS,
  CrmForecastSnapshotBackfillCoreError,
  assertNoCrmForecastSnapshotBackfillPiiKeys,
  getCrmForecastSnapshotBackfillStatus,
  logCrmForecastSnapshotBackfillResult,
  runCrmForecastSnapshotBackfillCore,
} from './_core';

type BackfillErrorCode =
  | 'date_out_of_bounds'
  | 'internal_error'
  | 'invalid_json'
  | 'invalid_range'
  | 'invalid_tenant'
  | 'range_too_large'
  | 'rate_limited'
  | 'unauthorized';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const backfillRequestSchema = z
  .object({
    dryRun: z.boolean().optional(),
    fromDate: z.string().regex(DATE_PATTERN),
    maxWorkItemsPerDate: z
      .number()
      .int()
      .positive()
      .max(CRM_FORECAST_SNAPSHOT_BACKFILL_MAX_WORK_ITEMS_PER_DATE)
      .optional(),
    tenantId: z.string().trim().min(1),
    toDate: z.string().regex(DATE_PATTERN),
  })
  .strict();

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/cron/crm/forecast-snapshots/backfill',
    limit: CRM_FORECAST_SNAPSHOT_BACKFILL_RATE_LIMIT,
    windowSeconds: CRM_FORECAST_SNAPSHOT_BACKFILL_RATE_LIMIT_WINDOW_SECONDS,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return normalizeRateLimitResponse(limited);

  if (
    !authorizeCronRequest({
      authorizationHeader: request.headers.get('authorization'),
      cronSecret: process.env.CRON_SECRET,
    })
  ) {
    return errorResponse('Unauthorized', 'unauthorized', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON', 'invalid_json', 400);
  }

  const parsed = backfillRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Invalid request', validationErrorCode(parsed.error), 400);
  }

  try {
    const result = await runCrmForecastSnapshotBackfillCore({
      dryRun: parsed.data.dryRun,
      fromDate: parsed.data.fromDate,
      maxWorkItemsPerDate: parsed.data.maxWorkItemsPerDate,
      now: new Date(),
      tenantId: parsed.data.tenantId,
      toDate: parsed.data.toDate,
    });
    assertNoCrmForecastSnapshotBackfillPiiKeys(result);
    const status = getCrmForecastSnapshotBackfillStatus(result);
    logCrmForecastSnapshotBackfillResult(result, status);

    return NextResponse.json({ result, success: status === 200 }, { status });
  } catch (error) {
    const mapped = mapCoreError(error);
    if (mapped.status !== 500) {
      return errorResponse(mapped.error, mapped.code, mapped.status);
    }

    console.error('[CRM Forecast Snapshot Backfill] route failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse('Internal Server Error', 'internal_error', 500);
  }
}

function normalizeRateLimitResponse(response: Response): Response {
  if (response.status !== 429) return response;
  return NextResponse.json(
    { error: 'Too Many Requests', code: 'rate_limited', success: false },
    {
      status: 429,
      headers: {
        'Retry-After': response.headers.get('Retry-After') ?? '60',
      },
    }
  );
}

function validationErrorCode(error: z.ZodError): BackfillErrorCode {
  if (error.issues.some(issue => issue.path[0] === 'tenantId')) return 'invalid_tenant';
  return 'invalid_range';
}

function mapCoreError(error: unknown): {
  code: BackfillErrorCode;
  error: string;
  status: 400 | 500;
} {
  if (error instanceof CrmForecastSnapshotBackfillCoreError) {
    switch (error.code) {
      case 'invalid_tenant':
        return { code: 'invalid_tenant', error: 'Invalid tenant', status: 400 };
      case 'range_too_large':
        return { code: 'range_too_large', error: 'Date range is too large', status: 400 };
      case 'date_out_of_bounds':
        return { code: 'date_out_of_bounds', error: 'Date is out of bounds', status: 400 };
      case 'invalid_range':
        return { code: 'invalid_range', error: 'Invalid date range', status: 400 };
    }
  }
  return { code: 'internal_error', error: 'Internal Server Error', status: 500 };
}

function errorResponse(error: string, code: BackfillErrorCode, status: 400 | 401 | 429 | 500) {
  return NextResponse.json({ error, code, success: false }, { status });
}
