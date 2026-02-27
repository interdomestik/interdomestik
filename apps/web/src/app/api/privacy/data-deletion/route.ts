import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { requestDataDeletionCore } from './_core';

type RequestBody = {
  reason?: string | null;
};

async function parseBody(request: NextRequest): Promise<RequestBody> {
  try {
    const parsed = (await request.json()) as RequestBody;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    null
  );
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await parseBody(request);
  const user = session.user as {
    id?: string;
    role?: string | null;
    tenantId?: string | null;
  };

  const result = await requestDataDeletionCore({
    userId: user.id || '',
    tenantId: user.tenantId,
    actorRole: user.role ?? null,
    reason: body.reason,
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json(result.body, { status: result.status });
}
