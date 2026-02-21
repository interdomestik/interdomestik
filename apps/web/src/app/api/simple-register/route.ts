import { registerUser } from '@/features/auth/registration.service';
import { NextRequest, NextResponse } from 'next/server';
import { simpleRegisterApiCore } from './_core';
import { resolveTenantIdFromRequest } from '@/lib/tenant/tenant-request';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = await resolveTenantIdFromRequest({
      tenantIdFromQuery: req.nextUrl.searchParams.get('tenantId'),
    });

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
