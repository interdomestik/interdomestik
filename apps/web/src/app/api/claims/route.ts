import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

import { listClaimsCore } from './_core';

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/claims',
    limit: 60,
    windowSeconds: 60,
    headers: request.headers,
  });
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await listClaimsCore({ session, url: new URL(request.url) });
  return NextResponse.json(result.body, { status: result.status });
}
