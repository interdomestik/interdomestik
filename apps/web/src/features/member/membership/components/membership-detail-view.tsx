'use client';

import { membershipStatusKey } from '@/lib/utils/membership-status';

import { LeaveCompanyProgramme } from './leave-company-programme';

import { OpsDocumentsPanel, OpsStatusBadge, OpsTimeline } from '@/components/ops';
import {
  DbDocument,
  getMembershipActions,
  getSponsoredMembershipState,
  OpsActionConfig,
  toOpsDocuments,
  toOpsStatus,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/membership';
import { useRouter } from '@/i18n/routing';
import { formatPilotDateTime } from '@/lib/utils/date';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cancelSubscription, getPaymentUpdateUrl } from '@/actions/subscription.core';
import { buildCancellationFeedbackMessage } from '@/features/member/membership/cancellation-feedback';
import { toast } from 'sonner';
import { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
import { MembershipEntityDisclosureNotice } from './MembershipEntityDisclosureNotice';
import { MembershipActions } from './membership-actions';
import { MembershipPeriodGraceFacts } from './membership-period-grace-facts';
import { MEMBERSHIP_REGION } from './membership-region-styles';

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

export function DetailView({ subscription, documents, t }: DetailViewProps): React.JSX.Element {
  const cancellationKeyRef = useRef<string | null>(null);
  const router = useRouter();
  const locale = useLocale();
  const tStatus = useTranslations('common.membershipStatus');
  const { primary: adapterPrimary, secondary } = getMembershipActions(subscription, t);
  const isPaddlePaymentUpdate =
    !subscription.sponsorCoverage &&
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
  const leaveEntryId = subscription.sponsorCoverage?.entryId ?? subscription.sponsorLeaveEntryId;
  const isMountedRef = useRef(true);
  const isPaymentUpdatePendingRef = useRef(false);
  const [isPaymentUpdatePending, setIsPaymentUpdatePending] = useState(false);
  const [paymentUpdateStatus, setPaymentUpdateStatus] = useState<string | null>(null);
  const isCancelPendingRef = useRef(false);
  const [isCancelPending, setIsCancelPending] = useState(false);

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

  const showPaymentUpdateError = (message = t('errors.payment_update_failed')) => {
    resetPaymentUpdatePending();
    setPaymentUpdateStatus(message);
    toast.error(message);
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
      if ('code' in result && result.code === 'CLOSED') {
        showPaymentUpdateError(t('CLOSED'));
        return;
      }
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

  const showActionError = (error: unknown) => {
    if (!isMountedRef.current) return;
    cancellationKeyRef.current = null;
    console.error(error);
    toast.error(t('errors.action_failed'));
  };

  // Cancellation, extracted from handleAction. Its body sits directly in this try, so a throw before the
  // first await (key creation) is caught in the same call stack as before, while the view is mounted.
  const handleCancel = async () => {
    try {
      if (!confirm(t('actions.confirm_cancel'))) return;

      if (isCancelPendingRef.current) return;
      isCancelPendingRef.current = true;
      setIsCancelPending(true);
      let result: Awaited<ReturnType<typeof cancelSubscription>>;
      try {
        // Key creation sits inside the pending scope: if it throws, the button is restored too.
        const idempotencyKey = cancellationKeyRef.current ?? crypto.randomUUID();
        cancellationKeyRef.current = idempotencyKey;
        result = await cancelSubscription(subscription.id, idempotencyKey);
      } finally {
        isCancelPendingRef.current = false;
        if (isMountedRef.current) setIsCancelPending(false);
      }
      if (result.error || !result.success) {
        cancellationKeyRef.current = null;
        toast.error(
          'code' in result && result.code === 'CLOSED' ? t('CLOSED') : t('errors.action_failed')
        );
        return;
      }

      cancellationKeyRef.current = null;
      toast.success(buildCancellationFeedbackMessage(t, result.cancellationTerms, locale));
    } catch (error) {
      showActionError(error);
    }
  };

  const handleAction = async (id: string) => {
    if (isPaymentUpdateAction(id)) {
      await handlePaymentUpdate();
      return;
    }
    // Cancellation has its own single error handler; keeping it outside the try below means an error
    // is never handled twice.
    if (id === 'cancel') {
      await handleCancel();
      return;
    }
    try {
      if (id === 'complete_membership') {
        router.push(getMembershipPricingHref(subscription.planId));
        return;
      }

      console.log('[Membership Action] Unhandled:', id);
    } catch (error) {
      showActionError(error);
    }
  };

  const actionLabel = (config: OpsActionConfig) => {
    if (isPaymentUpdateAction(config.id)) return t('dunning.update_payment_button');
    if (config.id === 'cancel' && isCancelPending) return t('actions.cancel_pending');
    return config.label;
  };
  const actionDisabled = (config: OpsActionConfig) => {
    if (isPaymentUpdateAction(config.id)) return isPaymentUpdatePending;
    if (config.id === 'cancel') return isCancelPending || config.disabled;
    return config.disabled;
  };
  const mapAction = (config: OpsActionConfig) => ({
    ...config,
    label: actionLabel(config),
    disabled: actionDisabled(config),
    onClick: () => handleAction(config.id),
  });

  return (
    <div className="grid min-w-0 gap-6">
      <section
        aria-labelledby="membership-status-title"
        className={MEMBERSHIP_REGION}
        data-testid="membership-status-region"
      >
        <h2 id="membership-status-title" className="text-lg font-semibold tracking-tight">
          {subscription.plan?.name || subscription.planId}
        </h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <dt className="text-foreground/70">{t('plan.status_label')}</dt>
            <dd>
              <OpsStatusBadge
                {...toOpsStatus(subscription.status)}
                label={tStatus(membershipStatusKey(subscription.status))}
              />
            </dd>
          </div>
          <MembershipPeriodGraceFacts subscription={subscription} locale={locale} t={t} />
        </dl>

        <MembershipEntityDisclosureNotice
          testId="membership-entity-disclosure"
          disclosure={subscription.entityDisclosure}
        />

        {primary?.id === 'complete_membership' || sponsoredState === 'inactive' ? (
          <div className="rounded-xl border border-foreground/60 p-4 forced-colors:border-[CanvasText]">
            <h3 className="text-sm font-semibold">{t('ops.membership_not_active_title')}</h3>
            <p className="mt-1 text-sm leading-6 text-foreground/70">
              {t('ops.membership_not_active_body')}
            </p>
          </div>
        ) : null}

        {leaveEntryId ? <LeaveCompanyProgramme entryId={leaveEntryId} t={t} /> : null}

        <MembershipActions
          primary={primary ? mapAction(primary) : undefined}
          secondary={secondary.map(mapAction)}
        />

        {isPaymentUpdateAction(primary?.id ?? '') && paymentUpdateStatus ? (
          <p
            role="status"
            aria-live="polite"
            data-testid="payment-update-status"
            className="text-sm text-foreground/70"
          >
            {paymentUpdateStatus}
          </p>
        ) : null}
      </section>

      <div className="grid min-w-0 items-start gap-6 md:grid-cols-2">
        <OpsTimeline
          title={t('timeline.title')}
          events={toOpsTimelineEvents(subscription, t)}
          emptyLabel={t('timeline.empty')}
          formatTimestamp={value => formatPilotDateTime(value, locale, t('plan.na'))}
        />
        <OpsDocumentsPanel
          title={t('documents.title')}
          documents={toOpsDocuments(documents)}
          emptyLabel={t('documents.empty')}
          viewLabel={t('documents.view')}
        />
      </div>
    </div>
  );
}
