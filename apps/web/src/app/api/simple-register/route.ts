import { registerUser } from '@/features/auth/registration.service';
import {
  resolveTenantIdFromSources,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
} from '@/lib/tenant/tenant-hosts';
import { NextRequest, NextResponse } from 'next/server';
import { simpleRegisterApiCore } from './_core';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = resolveTenantIdFromSources(
      {
        host: req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '',
        cookieTenantId: req.cookies.get(TENANT_COOKIE_NAME)?.value ?? null,
        headerTenantId: req.headers.get(TENANT_HEADER_NAME),
        queryTenantId: req.nextUrl.searchParams.get('tenantId'),
      },
      { productionSensitive: true }
    );

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 });
    }

    const result = await simpleRegisterApiCore(
      body,
      {
        registerUserFn: registerUser,
      },
      tenantId
    );

    switch (result.kind) {
      case 'ok':
        return NextResponse.json({ success: true, data: result.data }, { status: 201 });
      case 'badRequest':
        return NextResponse.json({ error: result.error }, { status: 400 });
      case 'conflict':
        return NextResponse.json({ error: result.error }, { status: 409 });
      default:
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  } catch (error) {
    console.error('Simple registration API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
