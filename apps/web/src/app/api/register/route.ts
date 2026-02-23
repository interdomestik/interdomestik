import { registerMemberCore } from '@/lib/actions/agent/register-member';
import { auth } from '@/lib/auth';
import {
  hasHostSessionTenantMismatch,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  resolveTenantFromHost,
  resolveTenantIdFromSources,
} from '@/lib/tenant/tenant-hosts';
import { NextRequest, NextResponse } from 'next/server';
import { registerUserApiCore } from './_core';

function getRequestHost(req: NextRequest): string {
  return req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
}

function resolveTenantIdFromRequest(
  req: NextRequest
): ReturnType<typeof resolveTenantFromHost> | null {
  return resolveTenantIdFromSources(
    {
      host: getRequestHost(req),
      cookieTenantId: req.cookies.get(TENANT_COOKIE_NAME)?.value ?? null,
      headerTenantId: req.headers.get(TENANT_HEADER_NAME),
      queryTenantId: req.nextUrl.searchParams.get('tenantId'),
    },
    { productionSensitive: true }
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const hostTenantId = resolveTenantFromHost(getRequestHost(req));
    const sessionTenantId = (session.user as { tenantId?: string | null }).tenantId;

    if (hasHostSessionTenantMismatch(hostTenantId, sessionTenantId)) {
      return NextResponse.json(
        { code: 'WRONG_TENANT_CONTEXT', message: 'Wrong tenant context' },
        { status: 401 }
      );
    }

    const tenantId = resolveTenantIdFromRequest(req);

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 });
    }

    const result = await registerUserApiCore(
      {
        body,
        actor: { id: session.user.id, name: session.user.name },
        tenantId,
      },
      {
        registerMemberFn: (actor, tenantId, formData) =>
          registerMemberCore(actor, tenantId, null, formData),
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Registration API wrapper error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
