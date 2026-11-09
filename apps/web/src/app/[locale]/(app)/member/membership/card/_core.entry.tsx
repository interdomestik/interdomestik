import { getSessionSafe } from '@/components/shell/session';
import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';
import { resolveEffectiveMembership } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { MembershipCard } from './membership-card';
import { toMemberCardSubscription } from './membership-card-subscription';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export default async function MemberCardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionSafe('MemberMembershipCardPage');

  if (!session) {
    redirect(`/${locale}/login`);
  }

  const t = await getTranslations('membership.card');

  const hasTenant = !!(session.user as { tenantId?: string | null }).tenantId;

  const authorized = hasTenant ? await authorizeSessionUserTenant(session.user.id) : null;

  const effective = authorized
    ? await withTenantAuthority(authorized, async tx => {
        const resolved = await resolveEffectiveMembership(
          tx,
          readTenantAuthority(authorized).tenantId,
          [session.user.id],
          new Date()
        );
        return resolved.get(session.user.id);
      })
    : null;
  let subscription = null;
  if (effective?.source === 'sponsor') {
    subscription = {
      ...effective.lifecycle,
      planId: effective.planId,
      currentPeriodEnd: effective.windowEnd,
    };
  } else if (effective?.source === 'subscription') {
    subscription = effective.subscription;
  }
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
