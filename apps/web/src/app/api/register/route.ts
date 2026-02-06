import { registerMemberCore } from '@/lib/actions/agent/register-member';
import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { registerUserApiCore } from './_core';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    const result = await registerUserApiCore(
      {
        body,
        actor: { id: session.user.id, name: session.user.name },
        tenantId: 'default-tenant',
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
