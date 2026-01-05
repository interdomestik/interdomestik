import { z } from 'zod';

/** Zod schema for NotificationPreferences with strict allowed keys */
export const notificationPreferencesSchema = z
  .object({
    emailClaimUpdates: z.boolean(),
    emailMarketing: z.boolean(),
    emailNewsletter: z.boolean(),
    pushClaimUpdates: z.boolean(),
    pushMessages: z.boolean(),
    inAppAll: z.boolean(),
  })
  .strict(); // Reject unknown keys

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailClaimUpdates: true,
  emailMarketing: false,
  emailNewsletter: true,
  pushClaimUpdates: true,
  pushMessages: true,
  inAppAll: true,
};
