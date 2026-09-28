'use client';

import { OpsActionBar, OpsDocumentsPanel, OpsStatusBadge, OpsTimeline } from '@/components/ops';
import {
  DbDocument,
  getMembershipActions,
  getSponsoredMembershipState,
  OpsActionConfig,
  toOpsDocuments,
  toOpsStatus,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/membership';
import { Link, useRouter } from '@/i18n/routing';
import { formatPilotDateTime } from '@/lib/utils/date';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  activateSponsoredMembership,
  cancelSubscription,
  getPaymentUpdateUrl,
} from '@/actions/subscription.core';
import { buildCancellationFeedbackMessage } from '@/features/member/membership/cancellation-feedback';
import { toast } from 'sonner';
import { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
import { MembershipEntityDisclosureNotice } from './MembershipEntityDisclosureNotice';
import { MembershipPeriodGraceFacts } from './membership-period-grace-facts';

type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

function normalizePricingPlanId(planId: string | null | undefined) {
  if (!planId) return null;

  const normalized = planId.trim().toLowerCase();
  if (normalized.includes('family')) return 'family';
  if (normalized.includes('business')) return 'business';
  if (normalized.includes('standard')) return 'standard';

  return null;
}

function getMembershipPricingHref(planId?: string | null) {
  const normalizedPlanId = normalizePricingPlanId(planId ?? null);
  return normalizedPlanId ? `/pricing?plan=${normalizedPlanId}` : '/pricing';
}

type DetailViewProps = Readonly<{
  subscription: SubscriptionRecord;
  documents: DbDocument[];
  t: TranslationFn;
}>;

export function DetailView({ subscription, documents, t }: DetailViewProps) {
  const cancellationKeyRef = useRef<string | null>(null);
  const router = useRouter();
  const locale = useLocale();
  const { primary: adapterPrimary, secondary } = getMembershipActions(subscription, t);
  const isPaddlePaymentUpdate =
    subscription.provider === 'paddle' &&
    (subscription.status === 'active' || subscription.status === 'past_due');
  let primary: OpsActionConfig | undefined = adapterPrimary;
  if (isPaddlePaymentUpdate) {
    primary = {
      id: 'update_payment',
      label: t('dunning.update_payment_button'),
      variant: 'default',
    };
  } else if (adapterPrimary?.id === 'renew' || adapterPrimary?.id === 'update_payment') {
    primary = undefined;
  }
  const sponsoredState = getSponsoredMembershipState(subscription);
  const isMountedRef = useRef(true);
  const isPaymentUpdatePendingRef = useRef(false);
  const [isPaymentUpdatePending, setIsPaymentUpdatePending] = useState(false);
  const [paymentUpdateStatus, setPaymentUpdateStatus] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isPaymentUpdateAction = (id: string) => id === 'renew' || id === 'update_payment';

  const resetPaymentUpdatePending = () => {
    isPaymentUpdatePendingRef.current = false;
    setIsPaymentUpdatePending(false);
  };

  const showPaymentUpdateError = () => {
    resetPaymentUpdatePending();
    setPaymentUpdateStatus(t('errors.payment_update_failed'));
    toast.error(t('errors.payment_update_failed'));
  };

  const handlePaymentUpdate = async () => {
    // Ref guard is synchronous (unlike state, which batches), so a second click
    // fired before this component re-renders is still rejected here.
    if (isPaymentUpdatePendingRef.current) return;
    isPaymentUpdatePendingRef.current = true;
    setIsPaymentUpdatePending(true);
    setPaymentUpdateStatus(t('actions.payment_update_preparing'));

    try {
      const result = await getPaymentUpdateUrl(subscription.id);
      if (!isMountedRef.current) return;
      if (result.error || !result.url) {
        showPaymentUpdateError();
        return;
      }

      // Redirecting to the provider's approved payment page is not entitlement
      // or payment success; the status stays truthful until the browser unloads.
      setPaymentUpdateStatus(t('actions.payment_update_opening'));
      window.location.href = result.url;
    } catch {
      if (!isMountedRef.current) return;
      // Provider client errors can carry tokens or keys, so log only a static marker.
      console.error('[Membership Action] Payment update failed');
      showPaymentUpdateError();
    }
  };

  const handleAction = async (id: string) => {
    if (isPaymentUpdateAction(id)) {
      await handlePaymentUpdate();
      return;
    }
    try {
      if (id === 'activate_sponsored') {
        const result = await activateSponsoredMembership(subscription.id);
        if ('error' in result) {
          toast.error(t('errors.action_failed'));
          return;
        }

        toast.success(t('sponsored.activation.success'));
        return;
      }

      if (id === 'complete_membership') {
        router.push(getMembershipPricingHref(subscription.planId));
        return;
      }

      if (id === 'cancel') {
        if (!confirm(t('actions.confirm_cancel'))) return;

        const idempotencyKey = cancellationKeyRef.current ?? crypto.randomUUID();
        cancellationKeyRef.current = idempotencyKey;
        const result = await cancelSubscription(subscription.id, idempotencyKey);
        if (result.error || !result.success) {
          cancellationKeyRef.current = null;
          toast.error(t('errors.action_failed'));
          return;
        }

        cancellationKeyRef.current = null;
        toast.success(buildCancellationFeedbackMessage(t, result.cancellationTerms));
        return;
      }

      console.log('[Membership Action] Unhandled:', id);
    } catch (err) {
      if (!isMountedRef.current) return;
      cancellationKeyRef.current = null;
      console.error(err);
      toast.error(t('errors.action_failed'));
    }
  };

  const mapAction = (config: OpsActionConfig) => ({
    ...config,
    label: isPaymentUpdateAction(config.id) ? t('dunning.update_payment_button') : config.label,
    disabled: isPaymentUpdateAction(config.id) ? isPaymentUpdatePending : config.disabled,
    onClick: () => handleAction(config.id),
  });

  return (
    <div className="space-y-4 h-full overflow-y-auto pr-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            {subscription.plan?.name || subscription.planId}
            <OpsStatusBadge {...toOpsStatus(subscription.status)} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <MembershipPeriodGraceFacts subscription={subscription} locale={locale} t={t} />

          <MembershipEntityDisclosureNotice
            testId="membership-entity-disclosure"
            disclosure={subscription.entityDisclosure}
          />

          <OpsActionBar
            primary={primary ? mapAction(primary) : undefined}
            secondary={secondary.map(mapAction)}
          />

          {isPaymentUpdateAction(primary?.id ?? '') && paymentUpdateStatus ? (
            <p
              role="status"
              aria-live="polite"
              data-testid="payment-update-status"
              className="text-sm text-muted-foreground"
            >
              {paymentUpdateStatus}
            </p>
          ) : null}

          {primary?.id === 'complete_membership' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('ops.membership_not_active_title')}
              </h4>
              <p className="mt-1 text-sm text-slate-600">{t('ops.membership_not_active_body')}</p>
            </div>
          ) : null}

          {sponsoredState === 'activation_required' ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('sponsored.activation.title')}
              </h4>
              <p className="mt-1 text-sm text-slate-600">{t('sponsored.activation.body')}</p>
              <button
                type="button"
                onClick={() => handleAction('activate_sponsored')}
                className="mt-3 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('sponsored.activation.cta')}
              </button>
            </div>
          ) : null}

          {sponsoredState === 'eligible_for_family_upgrade' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-900">
                {t('sponsored.upgrade.title')}
              </h4>
              <p className="mt-1 text-sm text-slate-600">{t('sponsored.upgrade.body')}</p>
              <Link
                href="/pricing?plan=family"
                className="mt-3 inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                {t('sponsored.upgrade.cta')}
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <OpsTimeline
          title={t('timeline.title')}
          events={toOpsTimelineEvents(subscription, t)}
          emptyLabel={t('timeline.empty')}
          formatTimestamp={value => formatPilotDateTime(value, locale, t('plan.na'))}
        />
        <OpsDocumentsPanel
          title="Documents"
          documents={toOpsDocuments(documents)}
          emptyLabel="No documents"
          viewLabel="View"
        />
      </div>
    </div>
  );
}
