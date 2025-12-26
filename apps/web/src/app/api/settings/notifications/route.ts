import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

import {
  getNotificationPreferencesCore,
  type NotificationPreferences,
  upsertNotificationPreferencesCore,
} from './_core';

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/settings/notifications:get',
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

    const preferences = await getNotificationPreferencesCore({ userId: session.user.id });
    return NextResponse.json(preferences);
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/settings/notifications:post',
    limit: 15,
    windowSeconds: 60,
    headers: request.headers,
  });
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: NotificationPreferences;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    await upsertNotificationPreferencesCore({
      userId: session.user.id,
      preferences: body,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}
