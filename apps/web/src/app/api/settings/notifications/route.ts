import { resolveTenantBoundary } from '@/app/api/tenant-boundary';
import { notificationPreferencesSchema } from '@interdomestik/domain-users/user-settings/types';
import { enforceRateLimit } from '@/lib/rate-limit';
import { withMemberAcceptance } from '@/lib/privacy/require-member-acceptance';
import { NextResponse } from 'next/server';

import { getNotificationPreferencesCore, upsertNotificationPreferencesCore } from './_core';

export const GET = withMemberAcceptance(async (authorized, request) => {
  const limited = await enforceRateLimit({
    name: 'api/settings/notifications:get',
    limit: 30,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  try {
    const { session } = authorized;

    const tenant = resolveTenantBoundary(session);
    if (!tenant.success) {
      return tenant.response;
    }

    const preferences = await getNotificationPreferencesCore({
      userId: session.user.id,
      authority: authorized.authority,
    });
    return NextResponse.json(preferences);
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
});

export const POST = withMemberAcceptance(async (authorized, request) => {
  const limited = await enforceRateLimit({
    name: 'api/settings/notifications:post',
    limit: 15,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  try {
    const { session } = authorized;

    const tenant = resolveTenantBoundary(session);
    if (!tenant.success) {
      return tenant.response;
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = notificationPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid preferences' }, { status: 400 });
    }

    await upsertNotificationPreferencesCore({
      userId: session.user.id,
      authority: authorized.authority,
      preferences: parsed.data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
});
