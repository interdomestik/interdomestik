import { FunnelActivationTracker } from '@/components/analytics/funnel-trackers';
import { MockActivationTrigger } from '@/components/billing/mock-activation-trigger';
import { getSessionSafe } from '@/components/shell/session';
import { isUiV2Enabled } from '@/lib/flags';
import { isBillingTestActivationEnabled } from '@/lib/runtime-environment';
import { getSupportContacts } from '@/lib/support-contacts';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { CheckCircle2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { SuccessAccountPanel } from './success-account-panel';
import { SuccessEntityDisclosure } from './success-entity-disclosure';
import { SuccessSecondaryContent } from './success-secondary-content';
import { SuccessStatusActions } from './success-status-actions';

interface SuccessPageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MembershipSuccessPage({ params, searchParams }: SuccessPageProps) {
  const { locale } = await params;
  const session = await getSessionSafe('MemberMembershipSuccessPage');
  if (!session) redirect(`/${locale}/login`);

  const query = searchParams ? await searchParams : {};
  const testParam = firstQueryValue(query.test);
  const planId = firstQueryValue(query.planId);
  const priceId = firstQueryValue(query.priceId);
  const checkParam = firstQueryValue(query.check);
  const tenantId = session.user.tenantId ?? null;
  const classificationPending =
    (session.user as { tenantClassificationPending?: boolean | null })
      .tenantClassificationPending === true;
  const activeSubscription = tenantId
    ? await getActiveSubscription(session.user.id, tenantId)
    : null;
  const membershipActive = Boolean(activeSubscription);
  const t = await getTranslations({ locale, namespace: 'membership.success' });
  const support = getSupportContacts({
    tenantId: classificationPending ? null : tenantId,
    locale,
  });
  const canMockActivate = testParam === 'true' && isBillingTestActivationEnabled();
  const activeTopNote = classificationPending ? t('classification_note') : t('active_note');

  return (
    <div className="container min-h-svh max-w-4xl px-4 py-12" data-testid="success-page-ready">
      {canMockActivate && planId && priceId ? (
        <MockActivationTrigger planId={planId} priceId={priceId} />
      ) : null}
      <FunnelActivationTracker
        enabled={membershipActive}
        tenantId={tenantId}
        locale={locale}
        uiV2Enabled={isUiV2Enabled()}
        planId={planId ?? null}
      />

      <div className="mb-12 text-center motion-reduce:animate-none">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-50 forced-colors:border">
          <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden="true" />
        </div>
        <h1 className="mb-4 break-all text-4xl font-extrabold tracking-tight">
          {membershipActive ? t('title') : t('registered_title')}
        </h1>
        {membershipActive ? (
          <>
            <p className="mx-auto max-w-2xl text-xl text-muted-foreground">{t('subtitle')}</p>
            <p className="mx-auto mt-4 max-w-2xl rounded-2xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {activeTopNote}
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-medium text-muted-foreground">
              {t('onboarding_note')}
            </p>
          </>
        ) : null}
      </div>

      {membershipActive ? (
        <SuccessEntityDisclosure
          activeSubscription={activeSubscription}
          tenantId={tenantId}
          locale={locale}
        />
      ) : null}

      <SuccessSecondaryContent
        membershipActive={membershipActive}
        accountPanel={
          <SuccessAccountPanel
            membershipActive={membershipActive}
            memberName={session.user.name}
            memberId={session.user.id}
            memberNumber={(session.user as { memberNumber?: string | null }).memberNumber}
            copy={{
              registeredStatus: t('registered_status'),
              registeredBody: t('registered_body'),
              cardLabel: t('card_label'),
              statusActive: t('status_active'),
              cardIdPrefix: t('card_id_prefix'),
              wallet: t('cta_wallet'),
              install: t('cta_install'),
            }}
          />
        }
        support={support}
        copy={{
          hotlineLabel: t('hotline_label'),
          hotlineHint: t('hotline_hint'),
          disclaimerTitle: t('hotline_disclaimer.title'),
          disclaimerBody: t('hotline_disclaimer.body'),
          benefitsTitle: t('benefits_title'),
          benefits: membershipActive ? [1, 2, 3, 4].map(i => t(`benefits_${i}` as never)) : [],
        }}
      />

      <SuccessStatusActions
        locale={locale}
        membershipActive={membershipActive}
        checkRequested={checkParam === '1'}
        copy={{
          activeAccount: t('cta_open_dashboard'),
          activeClaim: t('cta_start_claim'),
          activeHelper: t('cta_helper'),
          recheck: t('registered_primary_cta'),
          account: t('registered_secondary_cta'),
          helper: t('registered_helper'),
          pending: t('registered_recheck_pending'),
          active: t('registered_recheck_active'),
        }}
      />
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
