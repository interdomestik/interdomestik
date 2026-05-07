'use client';

import { CommercialFunnelEvents } from '@/lib/analytics';
import { authClient } from '@/lib/auth-client';
import { useRouter } from '@/i18n/routing';
import { Badge } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import {
  FALLBACK_CHECKOUT_PRICE_IDS,
  getSelectedPlanIdFromSearch,
  hasUsablePaddleClientToken,
} from './checkout-helpers';
import { runCheckoutAction } from './checkout-actions';
import { LocalCheckoutWarning } from './local-checkout-warning';
import { OtpCheckoutStep } from './otp-checkout-step';
import { findPlanById, buildPricingPlans } from './plan-model';
import { PricingPlanGrid } from './plan-grid';
import { PrecheckoutConfirmation } from './precheckout-confirmation';
import { isSelfServePlanId, shouldOpenSelfServePrecheckout } from './pricing-decisions';
import type { PlanId, PricingPlan, PricingTableProps } from './types';

export function PricingTable({
  userId,
  email,
  tenantId,
  billingTestMode,
  isSessionPending = false,
  checkoutConfig,
}: PricingTableProps) {
  const t = useTranslations('pricing');
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [preCheckoutPlanId, setPreCheckoutPlanId] = useState<string | null>(null);
  const [otpPlanId, setOtpPlanId] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState(email ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [localCheckoutUnavailablePlanId, setLocalCheckoutUnavailablePlanId] = useState<
    string | null
  >(null);
  const preCheckoutSectionRef = useRef<HTMLElement | null>(null);
  const otpSectionRef = useRef<HTMLElement | null>(null);
  const isPilotMode = process.env.NEXT_PUBLIC_PILOT_MODE === 'true';
  const resolvedPriceIds = {
    standardYear: checkoutConfig?.priceIds.standardYear ?? FALLBACK_CHECKOUT_PRICE_IDS.standardYear,
    familyYear: checkoutConfig?.priceIds.familyYear ?? FALLBACK_CHECKOUT_PRICE_IDS.familyYear,
    businessYear: checkoutConfig?.priceIds.businessYear ?? null,
  } as const;

  const plans = buildPricingPlans({ t, priceIds: resolvedPriceIds });
  const isBillingTestMode = billingTestMode ?? process.env.NEXT_PUBLIC_BILLING_TEST_MODE === '1';
  const paddleClientToken = checkoutConfig?.clientToken.trim() ?? '';
  const hasPaddleClientToken = hasUsablePaddleClientToken(paddleClientToken);
  const shouldUseDevCheckoutFallback =
    process.env.NODE_ENV === 'development' && !isBillingTestMode && !hasPaddleClientToken;

  useEffect(() => {
    const syncSelectedPlanFromLocation = () => {
      setSelectedPlanId(getSelectedPlanIdFromSearch(globalThis.location?.search ?? ''));
    };

    syncSelectedPlanFromLocation();
    globalThis.addEventListener('popstate', syncSelectedPlanFromLocation);

    return () => {
      globalThis.removeEventListener('popstate', syncSelectedPlanFromLocation);
    };
  }, []);

  useEffect(() => {
    if (!preCheckoutPlanId) return;

    CommercialFunnelEvents.pricingPrecheckoutViewed(
      {
        tenantId: null,
        variant: 'hero_v1',
        locale,
      },
      {
        plan_id: preCheckoutPlanId,
        flow_entry: userId ? 'logged_in_member' : 'anonymous_public',
      }
    );
  }, [locale, preCheckoutPlanId, userId]);

  useEffect(() => {
    if (!preCheckoutPlanId || !preCheckoutSectionRef.current) return;

    preCheckoutSectionRef.current.focus();
  }, [preCheckoutPlanId]);

  useEffect(() => {
    if (!otpPlanId || !otpSectionRef.current) return;

    otpSectionRef.current.focus();
  }, [otpPlanId]);

  const handleAction = async (
    planId: string,
    priceId: string,
    checkoutOverrides?: { email?: string; userId?: string }
  ) => {
    await runCheckoutAction({
      planId,
      priceId,
      checkoutConfig,
      locale,
      email,
      userId,
      tenantId,
      isPilotMode: process.env.NEXT_PUBLIC_PILOT_MODE === 'true',
      isBillingTestMode,
      shouldUseDevCheckoutFallback,
      push: router.push,
      setLoading,
      setLocalCheckoutUnavailablePlanId,
      checkoutOverrides,
    });
  };

  const otpPlan = findPlanById(plans, otpPlanId);
  const localCheckoutUnavailablePlan = findPlanById(plans, localCheckoutUnavailablePlanId);
  const sendOtpForPlan = async () => {
    if (!otpPlan || !otpEmail.trim()) {
      setOtpError(t('otpStep.errors.missingEmail'));
      return;
    }

    setOtpSending(true);
    setOtpError(null);
    setOtpSuccess(null);

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: otpEmail.trim().toLowerCase(),
        type: 'sign-in',
      });

      if (error) {
        setOtpError(error.message || t('otpStep.errors.sendFailed'));
        return;
      }

      setOtpSuccess(t('otpStep.sendSuccess'));
    } catch {
      setOtpError(t('otpStep.errors.sendFailed'));
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtpForPlan = async () => {
    if (!otpPlan) {
      return;
    }

    if (!otpPlan.priceId) {
      setOtpError(t('otpStep.errors.invalidCode'));
      return;
    }

    if (!otpEmail.trim()) {
      setOtpError(t('otpStep.errors.missingEmail'));
      return;
    }

    if (!otpCode.trim()) {
      setOtpError(t('otpStep.errors.missingCode'));
      return;
    }

    setOtpVerifying(true);
    setOtpError(null);

    try {
      const result = await authClient.signIn.emailOtp({
        email: otpEmail.trim().toLowerCase(),
        otp: otpCode.trim(),
        ...(tenantId
          ? {
              tenantClassificationPending: true,
              tenantId,
            }
          : {}),
      });

      if (result.error) {
        setOtpError(result.error.message || t('otpStep.errors.invalidCode'));
        return;
      }

      await handleAction(otpPlan.id, otpPlan.priceId, {
        email: otpEmail.trim().toLowerCase(),
        userId: result.data?.user?.id,
      });
    } catch {
      setOtpError(t('otpStep.errors.invalidCode'));
    } finally {
      setOtpVerifying(false);
    }
  };

  const preCheckoutPlan = findPlanById(plans, preCheckoutPlanId);
  const resetOtpStepState = () => {
    setOtpCode('');
    setOtpError(null);
    setOtpSuccess(null);
  };

  const openOtpStepForPlan = (planId: PlanId) => {
    setPreCheckoutPlanId(null);
    setOtpPlanId(planId);
    resetOtpStepState();
  };

  const closeOtpStep = () => {
    setOtpPlanId(null);
    resetOtpStepState();
  };

  const handlePreCheckoutContinue = () => {
    if (!preCheckoutPlan) {
      return;
    }

    if (!preCheckoutPlan.priceId) {
      return;
    }

    if (!userId) {
      openOtpStepForPlan(preCheckoutPlan.id);
      return;
    }

    void handleAction(preCheckoutPlan.id, preCheckoutPlan.priceId);
  };

  const handlePlanCtaClick = (plan: PricingPlan) => {
    CommercialFunnelEvents.pricingPlanCtaClicked(
      {
        tenantId: null,
        variant: 'hero_v1',
        locale,
      },
      {
        plan_id: plan.id,
        flow_entry: userId ? 'logged_in_member' : 'anonymous_public',
        plan_type: isSelfServePlanId(plan.id) ? 'self_serve' : 'assisted',
      }
    );

    if (shouldOpenSelfServePrecheckout({ userId, planId: plan.id })) {
      setPreCheckoutPlanId(plan.id);
      return;
    }

    if (!plan.priceId) {
      return;
    }

    void handleAction(plan.id, plan.priceId);
  };

  return (
    <div
      data-testid="pricing-table-root"
      className="space-y-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex flex-col items-center gap-4">
        <Badge
          variant="secondary"
          className="bg-green-50 text-green-700 border-green-200 font-bold px-4 py-1"
        >
          {t('billedAnnually')}
        </Badge>
      </div>

      <PricingPlanGrid
        plans={plans}
        selectedPlanId={selectedPlanId}
        loadingPriceId={loading}
        isPilotMode={isPilotMode}
        isSessionPending={isSessionPending}
        t={t}
        onPlanCtaClick={handlePlanCtaClick}
      />

      {localCheckoutUnavailablePlan ? (
        <LocalCheckoutWarning plan={localCheckoutUnavailablePlan} t={t} />
      ) : null}

      {preCheckoutPlan ? (
        <PrecheckoutConfirmation
          ref={preCheckoutSectionRef}
          plan={preCheckoutPlan}
          loading={loading === preCheckoutPlan.priceId}
          t={t}
          onContinue={handlePreCheckoutContinue}
          onCancel={() => setPreCheckoutPlanId(null)}
        />
      ) : null}

      {otpPlan ? (
        <OtpCheckoutStep
          ref={otpSectionRef}
          plan={otpPlan}
          email={otpEmail}
          code={otpCode}
          error={otpError}
          success={otpSuccess}
          sending={otpSending}
          verifying={otpVerifying}
          t={t}
          onEmailChange={setOtpEmail}
          onCodeChange={setOtpCode}
          onSend={sendOtpForPlan}
          onBack={closeOtpStep}
          onVerify={verifyOtpForPlan}
        />
      ) : null}
    </div>
  );
}
