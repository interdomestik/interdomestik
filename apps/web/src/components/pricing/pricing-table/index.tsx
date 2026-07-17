'use client';
import { CommercialFunnelEvents } from '@/lib/analytics';
import { useRouter } from '@/i18n/routing';
import { Badge } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { FALLBACK_CHECKOUT_PRICE_IDS, hasUsablePaddleClientToken } from './checkout-helpers';
import { LocalCheckoutWarning } from './local-checkout-warning';
import { OtpCheckoutStep } from './otp-checkout-step';
import { buildPricingPlans, findPlanById } from './plan-model';
import { PricingPlanGrid } from './plan-grid';
import { PrecheckoutConfirmation } from './precheckout-confirmation';
import { isSelfServePlanId, shouldOpenSelfServePrecheckout } from './pricing-decisions';
import type { PlanId, PricingPlan, PricingTableProps } from './types';
import { usePricingEmailOtp } from './use-pricing-email-otp';
import { usePricingTableState } from './use-pricing-table-state';
export function PricingTable({
  userId,
  email,
  tenantId,
  billingTestMode,
  isSessionPending = false,
  checkoutConfig,
  entityDisclosure,
  neutralEntryPlan,
  neutralPricingEntryUrl,
  navigateTopLevel,
}: PricingTableProps) {
  const [t, locale, router] = [useTranslations('pricing'), useLocale(), useRouter()];
  const priceIds = {
    standardYear: checkoutConfig?.priceIds.standardYear ?? FALLBACK_CHECKOUT_PRICE_IDS.standardYear,
    familyYear: checkoutConfig?.priceIds.familyYear ?? FALLBACK_CHECKOUT_PRICE_IDS.familyYear,
    businessYear: checkoutConfig?.priceIds.businessYear ?? null,
  } as const;
  const plans = buildPricingPlans({ t, priceIds });
  const isPilotMode = process.env.NEXT_PUBLIC_PILOT_MODE === 'true';
  const isBillingTestMode = billingTestMode ?? process.env.NEXT_PUBLIC_BILLING_TEST_MODE === '1';
  const shouldUseDevCheckoutFallback =
    process.env.NODE_ENV === 'development' &&
    !isBillingTestMode &&
    !hasUsablePaddleClientToken(checkoutConfig?.clientToken.trim() ?? '');
  const view = usePricingTableState({
    locale,
    email,
    userId,
    tenantId,
    checkoutConfig,
    isSessionPending,
    neutralEntryPlan,
    neutralPricingEntryUrl,
    navigateTopLevel,
    isPilotMode,
    isBillingTestMode,
    shouldUseDevCheckoutFallback,
    push: router.push,
  });
  const otpPlan = findPlanById(plans, view.otpPlanId);
  const otp = usePricingEmailOtp({
    initialEmail: email,
    locale,
    tenantId,
    onVerified: async identity => {
      if (!otpPlan?.priceId) throw new Error('otp_checkout_unavailable');
      await view.handleAction(otpPlan.id, otpPlan.priceId, identity);
    },
  });
  const preCheckoutPlan = findPlanById(plans, view.preCheckoutPlanId);
  const unavailablePlan = findPlanById(plans, view.localCheckoutUnavailablePlanId);
  const setOtpStep = (planId: PlanId | null) => {
    if (planId) view.setPreCheckoutPlanId(null);
    view.setOtpPlanId(planId);
    otp.reset();
  };
  const handlePreCheckoutContinue = () => {
    if (!preCheckoutPlan?.priceId) return;
    if (!userId) {
      if (view.continueAnonymousPlan(preCheckoutPlan.id)) return;
      return setOtpStep(preCheckoutPlan.id);
    }
    void view.handleAction(preCheckoutPlan.id, preCheckoutPlan.priceId);
  };
  const handlePlanCtaClick = (plan: PricingPlan) => {
    CommercialFunnelEvents.pricingPlanCtaClicked(
      { tenantId: null, variant: 'hero_v1', locale },
      {
        plan_id: plan.id,
        flow_entry: userId ? 'logged_in_member' : 'anonymous_public',
        plan_type: isSelfServePlanId(plan.id) ? 'self_serve' : 'assisted',
      }
    );
    if (shouldOpenSelfServePrecheckout({ userId, planId: plan.id })) {
      view.setPreCheckoutPlanId(plan.id);
    } else if (plan.priceId) {
      void view.handleAction(plan.id, plan.priceId);
    }
  };
  return (
    <div
      data-testid="pricing-table-root"
      className="space-y-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex flex-col items-center gap-4">
        <Badge
          variant="secondary"
          className="border-green-200 bg-green-50 px-4 py-1 font-bold text-green-700"
        >
          {t('billedAnnually')}
        </Badge>
      </div>
      <PricingPlanGrid
        plans={plans}
        selectedPlanId={view.selectedPlanId}
        loadingPriceId={view.loading}
        isPilotMode={isPilotMode}
        isSessionPending={isSessionPending}
        t={t}
        onPlanCtaClick={handlePlanCtaClick}
      />
      {unavailablePlan ? <LocalCheckoutWarning plan={unavailablePlan} t={t} /> : null}
      {preCheckoutPlan ? (
        <PrecheckoutConfirmation
          ref={view.preCheckoutSectionRef}
          plan={preCheckoutPlan}
          entityDisclosure={entityDisclosure ?? checkoutConfig?.entityDisclosure ?? null}
          loading={view.loading === preCheckoutPlan.priceId}
          t={t}
          onContinue={handlePreCheckoutContinue}
          onCancel={() => view.setPreCheckoutPlanId(null)}
        />
      ) : null}
      {otpPlan ? (
        <OtpCheckoutStep
          ref={view.otpHeadingRef}
          {...otp}
          t={t}
          onEmailChange={otp.setEmail}
          onCodeChange={otp.setCode}
          onSend={otp.send}
          onBack={() => setOtpStep(null)}
          onVerify={otp.verify}
          onChangeEmail={otp.changeEmail}
          onResend={otp.send}
        />
      ) : null}
    </div>
  );
}
