import { registerMemberCore } from '@/lib/actions/agent/register-member';
import { auth } from '@/lib/auth';
import {
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  coerceTenantId,
  resolveTenantFromHost,
} from '@/lib/tenant/tenant-hosts';
import { NextRequest, NextResponse } from 'next/server';
import { registerUserApiCore } from './_core';

function resolveTenantIdFromRequest(
  req: NextRequest
): ReturnType<typeof resolveTenantFromHost> | null {
  const isProdRegistrationFlow =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  const hostTenant = resolveTenantFromHost(
    req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  );
  if (hostTenant) return hostTenant;

  const cookieTenant = coerceTenantId(req.cookies.get(TENANT_COOKIE_NAME)?.value);
  if (cookieTenant) return cookieTenant;

  if (isProdRegistrationFlow) {
    return null;
  }

  const headerTenant = coerceTenantId(req.headers.get(TENANT_HEADER_NAME));
  if (headerTenant) return headerTenant;

  return coerceTenantId(req.nextUrl.searchParams.get('tenantId'));
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
