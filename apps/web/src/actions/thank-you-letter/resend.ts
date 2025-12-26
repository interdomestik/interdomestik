import { sendThankYouLetterCore } from './send';

export async function resendWelcomeEmailCore(userId: string) {
  const { db } = await import('@interdomestik/database/db');
  const { eq, desc } = await import('drizzle-orm');
  const { user, subscriptions } = await import('@interdomestik/database/schema');

  const userData = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });

  if (!userData) {
    return { success: false, error: 'User not found' };
  }

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
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
