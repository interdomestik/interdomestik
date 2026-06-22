import { revalidatePath } from 'next/cache';

import {
  updateNotificationPreferencesCore as updateNotificationPreferencesDomain,
  updateResidenceCountryCore as updateResidenceCountryDomain,
} from '@interdomestik/domain-users';
import type { UserSession } from '@interdomestik/domain-users/types';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/rate-limit';

import type { Session } from './context';

function toUserSession(session: NonNullable<Session> | null): UserSession | null {
  if (!session?.user) return null;
  const sessionUser = session.user as typeof session.user & { accessTenantId?: string | null };
  return {
    user: {
      accessTenantId: sessionUser.accessTenantId,
      agentId: session.user.agentId,
      branchId: session.user.branchId,
      email: session.user.email,
      id: session.user.id,
      name: session.user.name,
      role: session.user.role,
      tenantId: session.user.tenantId,
    },
  };
}

export async function updateNotificationPreferencesCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  preferences: unknown; // Accept unknown, Zod validates in domain layer
}): Promise<{ success: true } | { success: false; error: string }> {
  // Rate limit: 5 updates per minute
  const rateLimited = await enforceRateLimit({
    name: 'action:user-settings-update',
    limit: 5,
    windowSeconds: 60,
    headers: params.requestHeaders,
    productionSensitive: true,
  });

  if (rateLimited) {
    return { success: false as const, error: 'Too many requests. Please try again later.' };
  }

  const result = await updateNotificationPreferencesDomain({
    session: params.session as UserSession | null,
    preferences: params.preferences,
  });

  if (result.success) {
    revalidatePath('/member/settings');
    const updatedKeys =
      params.preferences && typeof params.preferences === 'object'
        ? Object.keys(params.preferences as Record<string, unknown>)
        : [];
    await logAuditEvent({
      actorId: params.session?.user?.id ?? null,
      actorRole: params.session?.user?.role ?? null,
      tenantId: params.session?.user?.tenantId ?? null,
      action: 'user.settings_updated',
      entityType: 'user_settings',
      entityId: params.session?.user?.id ?? null,
      metadata: { updatedKeys },
      headers: params.requestHeaders,
    });
  }

  return result;
}

export async function updateResidenceCountryCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  residenceCountry: unknown;
}) {
  const rateLimited = await enforceRateLimit({
    name: 'action:user-residence-country-update',
    limit: 5,
    windowSeconds: 60,
    headers: params.requestHeaders,
    productionSensitive: true,
  });

  if (rateLimited) {
    return { success: false as const, error: 'Too many requests. Please try again later.' };
  }

  const result = await updateResidenceCountryDomain(
    {
      residenceCountry: params.residenceCountry,
      session: toUserSession(params.session),
    },
    { logAuditEvent }
  );

  if (result.success && result.eventId) {
    revalidatePath('/member/settings');
    revalidatePath('/member/membership');
  }

  if (!result.success) return result;
  return {
    success: true as const,
    eventId: result.eventId,
    decision: {
      changeState: result.decision.changeState,
      toResidenceCountry: result.decision.toResidenceCountry,
    },
  };
}
