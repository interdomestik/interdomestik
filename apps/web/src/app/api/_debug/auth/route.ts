import { isE2EDiagnosticsEnabled, isProductionDeployment } from '@/lib/runtime-environment';
import { NextResponse } from 'next/server';

export async function GET() {
  if (isProductionDeployment() && !isE2EDiagnosticsEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
    PLAYWRIGHT: process.env.PLAYWRIGHT,
  });
}
