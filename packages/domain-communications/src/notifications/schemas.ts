import { z } from 'zod';

export const markNotificationReadSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required'),
});

export const markAllNotificationsReadSchema = z.object({
  // No params needed, just session
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});
