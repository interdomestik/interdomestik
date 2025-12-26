import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

import {
  deletePushSubscriptionCore,
  type PushSubscriptionBody,
  upsertPushSubscriptionCore,
} from './_core';

export async function POST(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/settings/push:post',
    limit: 20,
    windowSeconds: 60,
    headers: request.headers,
  });
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: PushSubscriptionBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = await upsertPushSubscriptionCore({ userId: session.user.id, body });
    if (result.status !== 200) {
      return NextResponse.json({ error: result.body.error }, { status: result.status });
    }

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: (session.user as { role?: string | null })?.role ?? null,
      action: result.audit?.action ?? 'push_subscription.upsert',
      entityType: result.audit?.entityType ?? 'push_subscription',
      entityId: result.audit?.entityId ?? body.endpoint,
      metadata: result.audit?.metadata,
      headers: request.headers,
    });

    return NextResponse.json(result.body);
  } catch (error) {
    console.error('Error saving push subscription:', error);
    return NextResponse.json({ error: 'Failed to save push subscription' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/settings/push:delete',
    limit: 30,
    windowSeconds: 60,
    headers: request.headers,
  });
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { endpoint?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const endpoint = body?.endpoint;

    const result = await deletePushSubscriptionCore({
      userId: session.user.id,
      endpoint: endpoint ?? '',
    });
    if (result.status !== 200) {
      return NextResponse.json({ error: result.body.error }, { status: result.status });
    }

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: (session.user as { role?: string | null })?.role ?? null,
      action: result.audit?.action ?? 'push_subscription.delete',
      entityType: result.audit?.entityType ?? 'push_subscription',
      entityId: result.audit?.entityId ?? endpoint,
      headers: request.headers,
    });

    return NextResponse.json(result.body);
  } catch (error) {
    console.error('Error deleting push subscription:', error);
    return NextResponse.json({ error: 'Failed to delete push subscription' }, { status: 500 });
  }
}
