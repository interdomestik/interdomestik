'use client';

import { CommercialFunnelEvents } from '@/lib/analytics';
import { useEffect, useRef, useState } from 'react';

import { runCheckoutAction } from './checkout-actions';
import { getSelectedPlanIdFromSearch } from './checkout-helpers';
import type { PricingTableProps } from './types';

type PricingTableStateArgs = Pick<
  PricingTableProps,
  'checkoutConfig' | 'email' | 'tenantId' | 'userId'
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
    const sync = () =>
      setSelectedPlanId(getSelectedPlanIdFromSearch(globalThis.location?.search ?? ''));
    sync();
    globalThis.addEventListener('popstate', sync);
    return () => globalThis.removeEventListener('popstate', sync);
  }, []);

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
  };
}
