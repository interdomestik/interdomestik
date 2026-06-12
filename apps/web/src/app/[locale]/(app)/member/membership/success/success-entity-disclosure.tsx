import { EntityDisclosureNotice } from '@/components/commercial/entity-disclosure-notice';
import {
  getSubscriptionEntityDisclosureCore,
  getTenantEntityDisclosureCore,
} from '@/lib/entity-disclosure.core';
import { getTranslations } from 'next-intl/server';

type ActiveSubscription = Parameters<typeof getSubscriptionEntityDisclosureCore>[0];

type SuccessEntityDisclosureProps = Readonly<{
  activeSubscription: ActiveSubscription;
  tenantId: string | null;
  locale: string;
}>;

export async function SuccessEntityDisclosure({
  activeSubscription,
  tenantId,
  locale,
}: SuccessEntityDisclosureProps) {
  const [disclosure, t] = await Promise.all([
    activeSubscription
      ? getSubscriptionEntityDisclosureCore(activeSubscription)
      : getTenantEntityDisclosureCore(tenantId),
    getTranslations({ locale, namespace: 'entityDisclosure' }),
  ]);

  return (
    <div className="mb-8">
      <EntityDisclosureNotice
        testId="membership-success-entity-disclosure"
        disclosure={disclosure}
        labels={{
          title: t('title'),
          contractingCompany: t('contractingCompany'),
          governingLaw: t('governingLaw'),
          unavailableTitle: t('unavailableTitle'),
          unavailableBody: t('unavailableBody'),
        }}
      />
    </div>
  );
}
