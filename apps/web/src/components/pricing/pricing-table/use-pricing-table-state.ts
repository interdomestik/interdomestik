'use client';

import { CommercialFunnelEvents } from '@/lib/analytics';
import { useEffect, useRef, useState } from 'react';

import { runCheckoutAction } from './checkout-actions';
import type { PricingTableProps } from './types';

type PricingTableStateArgs = Pick<
  PricingTableProps,
  | 'checkoutConfig'
  | 'email'
  | 'isSessionPending'
  | 'navigateTopLevel'
  | 'neutralEntryPlan'
  | 'neutralPricingEntryUrl'
  | 'tenantId'
  | 'userId'
> &
  Readonly<{
    locale: string;
    isPilotMode: boolean;
    isBillingTestMode: boolean;
    shouldUseDevCheckoutFallback: boolean;
    push: (href: string) => void;
  }>;

export function usePricingTableState(args: PricingTableStateArgs) {
  const { locale, userId } = args;
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [preCheckoutPlanId, setPreCheckoutPlanId] = useState<string | null>(null);
  const [otpPlanId, setOtpPlanId] = useState<string | null>(null);
  const [localCheckoutUnavailablePlanId, setLocalCheckoutUnavailablePlanId] = useState<
    string | null
  >(null);
  const preCheckoutSectionRef = useRef<HTMLElement | null>(null);
  const otpHeadingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (!args.neutralEntryPlan) return;
    setSelectedPlanId(args.neutralEntryPlan);
    if (args.isSessionPending || userId) return;
    setOtpPlanId(args.neutralEntryPlan);
  }, [args.isSessionPending, args.neutralEntryPlan, userId]);

  useEffect(() => {
    if (!preCheckoutPlanId) return;
    CommercialFunnelEvents.pricingPrecheckoutViewed(
      { tenantId: null, variant: 'hero_v1', locale },
      {
        plan_id: preCheckoutPlanId,
        flow_entry: userId ? 'logged_in_member' : 'anonymous_public',
      }
    );
    preCheckoutSectionRef.current?.focus();
  }, [locale, preCheckoutPlanId, userId]);

  useEffect(() => {
    if (otpPlanId) otpHeadingRef.current?.focus();
  }, [otpPlanId]);

  const handleAction = (
    planId: string,
    priceId: string,
    checkoutOverrides?: { email?: string; userId?: string }
  ) =>
    runCheckoutAction({
      planId,
      priceId,
      checkoutConfig: args.checkoutConfig,
      locale,
      email: args.email,
      userId,
      tenantId: args.tenantId,
      isPilotMode: args.isPilotMode,
      isBillingTestMode: args.isBillingTestMode,
      shouldUseDevCheckoutFallback: args.shouldUseDevCheckoutFallback,
      push: args.push,
      setLoading,
      setLocalCheckoutUnavailablePlanId,
      checkoutOverrides,
    });

  const continueAnonymousPlan = (planId: string): boolean => {
    if (!args.neutralPricingEntryUrl || (planId !== 'standard' && planId !== 'family'))
      return false;
    const target = new URL(args.neutralPricingEntryUrl);
    if (globalThis.location?.origin === target.origin) return false;
    target.search = '';
    target.hash = '';
    target.searchParams.set('plan', planId);
    const navigate = args.navigateTopLevel ?? (href => globalThis.location?.assign(href));
    navigate(target.href);
    return true;
  };

  return {
    loading,
    setLoading,
    selectedPlanId,
    preCheckoutPlanId,
    setPreCheckoutPlanId,
    otpPlanId,
    setOtpPlanId,
    localCheckoutUnavailablePlanId,
    setLocalCheckoutUnavailablePlanId,
    preCheckoutSectionRef,
    otpHeadingRef,
    handleAction,
    continueAnonymousPlan,
  };
}
