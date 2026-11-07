import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ROLE_AGENT } from '@/lib/roles.core';
import { NextRequest, NextResponse } from 'next/server';

// Direct member registration is retired (Plan070 ACQ-2, owner D1 a). It activated a membership
// with no payment act and an agent-set password. Members are created only by lead conversion after
// payment; agents record leads in the leads workspace. The endpoint keeps its rate limit and actor
// checks so callers learn nothing new, then refuses without reading the body or writing anything.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/register',
    limit: 5,
    windowSeconds: 60,
    headers: req.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user?.role !== ROLE_AGENT) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(
    {
      code: 'DIRECT_REGISTRATION_RETIRED',
      error: 'Direct member registration is retired. Record a lead instead.',
    },
    { status: 410 }
  );
}
