import { revalidatePath } from 'next/cache';

import type { UserSession } from '@interdomestik/domain-users/types';
import { updateNotificationPreferencesCore as updateNotificationPreferencesDomain } from '@interdomestik/domain-users/user-settings/update';

import { enforceRateLimit } from '@/lib/rate-limit';

import type { Session } from './context';

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
  });

  if (rateLimited) {
    return { success: false, error: 'Too many requests. Please try again later.' };
  }

  const result = await updateNotificationPreferencesDomain({
    session: params.session as UserSession | null,
    preferences: params.preferences,
  });

  if (result.success) {
    revalidatePath('/member/settings');
  }

  return result;
}
