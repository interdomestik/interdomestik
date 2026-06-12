import { getSessionSafe } from '@/components/shell/session';
import { and, db, eq, subscriptions } from '@interdomestik/database';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { MembershipCard } from './membership-card';
import { toMemberCardSubscription } from './membership-card-subscription';

export default async function MemberCardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionSafe('MemberMembershipCardPage');

  if (!session) {
    redirect(`/${locale}/login`);
  }

  const t = await getTranslations('membership.card');

  const tenantId = (session.user as { tenantId?: string | null }).tenantId ?? null;

  const subscription = tenantId
    ? await db.query.subscriptions.findFirst({
        where: and(eq(subscriptions.userId, session.user.id), eq(subscriptions.tenantId, tenantId)),
      })
    : null;

  const cardSubscription = toMemberCardSubscription(subscription);

  if (!cardSubscription) {
    redirect(`/${locale}/member/membership`);
  }

  const memberNumber =
    (session.user as { memberNumber?: string }).memberNumber ||
    `ID-${session.user.id.slice(0, 8).toUpperCase()}`;

  return (
    <MembershipCard
      locale={locale}
      memberName={session.user.name}
      memberNumber={memberNumber}
      memberSince={session.user.createdAt}
      subscription={cardSubscription}
      t={t}
    />
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
