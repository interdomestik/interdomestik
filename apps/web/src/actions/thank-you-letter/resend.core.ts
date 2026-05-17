import { sendThankYouLetterCore } from './send';

export async function resendWelcomeEmailCore(userId: string) {
  const { db } = await import('@interdomestik/database/db');
  const { eq, desc } = await import('drizzle-orm');
  const { user, subscriptions } = await import('@interdomestik/database/schema');

  // db-access-guard: system-exempt -- reason: admin resend resolves tenant ownership from selected user before subscription lookup
  const userData = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });

  if (!userData) {
    return { success: false, error: 'User not found' };
  }

  // db-access-guard: tenant-scoped -- reason: tenantId resolved from selected user before membership email subscription lookup
  const subscription = await db.query.subscriptions.findFirst({
    where: (table, { and, eq }) =>
      and(eq(table.userId, userId), eq(table.tenantId, userData.tenantId)),
    orderBy: [desc(subscriptions.createdAt)],
    with: {
      plan: true,
    },
  });

  const planName = subscription?.plan?.name || subscription?.planId || 'Membership';
  const planPriceValue = subscription?.plan?.price ? subscription.plan.price : '20.00';
  const planPrice = `€${planPriceValue}`;
  const planInterval = subscription?.plan?.interval || 'year';

  const memberSince = userData.createdAt || new Date();
  const expiresAt = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);

  return sendThankYouLetterCore({
    email: userData.email,
    memberName: userData.name,
    memberNumber: userData.memberNumber || `M-${userId.slice(0, 8).toUpperCase()}`,
    planName,
    planPrice,
    planInterval,
    memberSince,
    expiresAt,
    locale: 'en',
  });
}
