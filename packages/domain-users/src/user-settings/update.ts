import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { userNotificationPreferences } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { UserSession } from '../types';
import { notificationPreferencesSchema, type NotificationPreferences } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function updateNotificationPreferencesCore(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
  preferences: unknown; // Accept unknown and validate with Zod
}): Promise<{ success: true } | { success: false; error: string }> {
  const { session, authority, preferences: rawPreferences } = params;

  if (!session?.user || !authority) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate input with Zod (strict schema rejects unknown keys)
  const parsed = notificationPreferencesSchema.safeParse(rawPreferences);
  if (!parsed.success) {
    return {
      success: false,
      error: `Validation failed: ${parsed.error.issues[0]?.message ?? 'Invalid input'}`,
    };
  }
  const preferences: NotificationPreferences = parsed.data;

  let tenantId: string;
  try {
    tenantId = readTenantAuthority(authority).tenantId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const [existing] = await withTenantAuthority(authority, async tx =>
      tx
        .select()
        .from(userNotificationPreferences)
        .where(
          withTenant(
            tenantId,
            userNotificationPreferences.tenantId,
            eq(userNotificationPreferences.userId, session.user.id)
          )
        )
        .limit(1)
    );

    if (existing) {
      await withTenantAuthority(authority, async tx =>
        tx
          .update(userNotificationPreferences)
          .set({
            ...preferences,
            updatedAt: new Date(),
          })
          .where(
            withTenant(
              tenantId,
              userNotificationPreferences.tenantId,
              eq(userNotificationPreferences.userId, session.user.id)
            )
          )
      );
    } else {
      // db-access-guard: tenant-scoped -- reason: tenantId from validated session before preference insert
      await withTenantAuthority(authority, async tx =>
        tx.insert(userNotificationPreferences).values({
          id: nanoid(),
          tenantId,
          userId: session.user.id,
          ...preferences,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return { success: false, error: 'Failed to save preferences' };
  }
}
