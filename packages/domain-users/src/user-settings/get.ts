import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { userNotificationPreferences } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import type { UserSession } from '../types';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getNotificationPreferencesCore(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
}): Promise<
  | { success: true; preferences: NotificationPreferences; error: undefined }
  | { success: false; error: string }
> {
  const { session, authority } = params;

  if (!session?.user || !authority) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const { tenantId } = readTenantAuthority(authority);
    const [preferences] = await withTenantAuthority(authority, tx =>
      tx
        .select()
        .from(userNotificationPreferences)
        .where(
          and(
            eq(userNotificationPreferences.userId, session.user.id),
            eq(userNotificationPreferences.tenantId, tenantId)
          )
        )
        .limit(1)
    );

    if (!preferences) {
      return {
        success: true,
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
        error: undefined,
      };
    }

    return {
      success: true,
      preferences: {
        emailClaimUpdates: preferences.emailClaimUpdates,
        emailMarketing: preferences.emailMarketing,
        emailNewsletter: preferences.emailNewsletter,
        pushClaimUpdates: preferences.pushClaimUpdates,
        pushMessages: preferences.pushMessages,
        inAppAll: preferences.inAppAll,
      },
      error: undefined,
    };
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return { success: false, error: 'Failed to fetch preferences' };
  }
}
