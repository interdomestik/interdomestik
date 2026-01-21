import { performHealthCheck } from '@/features/health/health.service';
import { NextRequest, NextResponse } from 'next/server';
import { getHealthApiCore } from './_core';

export async function GET(_request: NextRequest) {
  const result = await getHealthApiCore({
    performHealthCheckFn: performHealthCheck,
  });

  const { statusCode, ...data } = result;

  return NextResponse.json(data.data || data, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

export async function HEAD(_request: NextRequest) {
  const result = await getHealthApiCore({
    performHealthCheckFn: performHealthCheck,
  });

  return new NextResponse(null, { status: result.statusCode });
}
