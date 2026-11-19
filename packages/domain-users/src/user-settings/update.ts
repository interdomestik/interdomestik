import {
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityDescriptor,
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

  let descriptor: TenantAuthorityDescriptor;
  try {
    descriptor = readTenantAuthority(authority);
  } catch {
    return { success: false, error: 'Unauthorized' };
  }
  const { tenantId, principal } = descriptor;
  if (!principal || principal.userId !== session.user.id) {
    return { success: false, error: 'Unauthorized' };
  }
  const { userId } = principal;

  // Validate input with Zod (strict schema rejects unknown keys)
  const parsed = notificationPreferencesSchema.safeParse(rawPreferences);
  if (!parsed.success) {
    return {
      success: false,
      error: `Validation failed: ${parsed.error.issues[0]?.message ?? 'Invalid input'}`,
    };
  }
  const preferences: NotificationPreferences = {
    emailClaimUpdates: parsed.data.emailClaimUpdates,
    emailMarketing: parsed.data.emailMarketing,
    emailNewsletter: parsed.data.emailNewsletter,
    pushClaimUpdates: parsed.data.pushClaimUpdates,
    pushMessages: parsed.data.pushMessages,
    inAppAll: parsed.data.inAppAll,
  };

  try {
    const [existing] = await withTenantAuthority(
      authority,
      async tx =>
        await tx
          .select()
          .from(userNotificationPreferences)
          .where(
            withTenant(
              tenantId,
              userNotificationPreferences.tenantId,
              eq(userNotificationPreferences.userId, userId)
            )
          )
          .limit(1)
    );

    if (existing) {
      await withTenantAuthority(
        authority,
        async tx =>
          await tx
            .update(userNotificationPreferences)
            .set({
              ...preferences,
              tenantId,
              userId,
              updatedAt: new Date(),
            })
            .where(
              withTenant(
                tenantId,
                userNotificationPreferences.tenantId,
                eq(userNotificationPreferences.userId, userId)
              )
            )
      );
    } else {
      // db-access-guard: tenant-scoped -- reason: tenant and user IDs come from the validated authority
      await withTenantAuthority(
        authority,
        async tx =>
          await tx.insert(userNotificationPreferences).values({
            ...preferences,
            id: nanoid(),
            tenantId,
            userId,
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
