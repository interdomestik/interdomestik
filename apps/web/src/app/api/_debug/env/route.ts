import { isE2EDiagnosticsEnabled, isProductionDeployment } from '@/lib/runtime-environment';
import { NextResponse } from 'next/server';

export async function GET() {
  if (isProductionDeployment() && !isE2EDiagnosticsEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV,
    CI: process.env.CI,
    INTERDOMESTIK_AUTOMATED: process.env.INTERDOMESTIK_AUTOMATED,
    PLAYWRIGHT: process.env.PLAYWRIGHT,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? 'set' : 'unset',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? 'set' : 'unset',
  });
}
