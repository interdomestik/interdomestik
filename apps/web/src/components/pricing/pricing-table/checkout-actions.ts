'use client';

import { CommercialFunnelEvents } from '@/lib/analytics';
import { getPaddleInstance } from '@interdomestik/domain-membership-billing/paddle';
import type { PublicBillingCheckoutConfig } from '@interdomestik/domain-membership-billing/paddle-server';
import { getCookie } from 'cookies-next';
import { toast } from 'sonner';

import { buildCheckoutCustomData, getPaddleLocale } from './checkout-helpers';

export function trackMembershipCheckoutOpened(args: {
  locale: string;
  planId: string;
  userId?: string;
}) {
  CommercialFunnelEvents.membershipCheckoutOpened(
    {
      tenantId: null,
      variant: 'hero_v1',
      locale: args.locale,
    },
    {
      plan_id: args.planId,
      flow_entry: args.userId ? 'logged_in_member' : 'anonymous_public',
    }
  );
}

async function redirectToSimulatedSuccess(args: {
  planId: string;
  priceId: string;
  includeBillingTestFlag: boolean;
  push: (href: string) => void;
}) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const params = new URLSearchParams();
  if (args.includeBillingTestFlag) {
    params.set('test', 'true');
  }
  params.set('priceId', args.priceId);
  params.set('planId', args.planId);
  args.push(`/member/membership/success?${params.toString()}`);
}

async function openPaddleCheckout(args: {
  checkoutConfig: PublicBillingCheckoutConfig | null | undefined;
  locale: string;
  email?: string;
  userId?: string;
  tenantId?: string | null;
  planId: string;
  priceId: string;
  checkoutEmail?: string;
  checkoutUserId?: string;
}) {
  if (!args.checkoutConfig) {
    console.error('Paddle checkout configuration missing');
    toast.error('Payment system unavailable. Please check configuration.');
    return;
  }

  const paddle = await getPaddleInstance({
    clientToken: args.checkoutConfig.clientToken,
    environment: args.checkoutConfig.environment,
  });

  if (!paddle) {
    console.error('Paddle not initialized');
    toast.error('Payment system unavailable. Please check configuration.');
    return;
  }

  const agentId = getCookie('agent_ref');
  const checkoutUserId = args.checkoutUserId ?? args.userId;
  const checkoutEmail = args.checkoutEmail ?? args.email;

  trackMembershipCheckoutOpened({
    locale: args.locale,
    planId: args.planId,
    userId: checkoutUserId,
  });

  paddle.Checkout.open({
    items: [{ priceId: args.priceId, quantity: 1 }],
    customer: checkoutEmail ? { email: checkoutEmail } : undefined,
    customData: buildCheckoutCustomData({
      userId: checkoutUserId,
      agentId: agentId ? String(agentId) : undefined,
      tenantId: args.tenantId ?? args.checkoutConfig.tenantId,
      search: globalThis.location.search,
    }),
    settings: {
      displayMode: 'overlay',
      theme: 'light',
      locale: getPaddleLocale(args.locale),
      successUrl: `${globalThis.location.origin}/${args.locale}/member/membership/success`,
    },
  });
}

export async function runCheckoutAction(args: {
  planId: string;
  priceId: string;
  checkoutConfig: PublicBillingCheckoutConfig | null | undefined;
  locale: string;
  email?: string;
  userId?: string;
  tenantId?: string | null;
  isPilotMode: boolean;
  isBillingTestMode: boolean;
  shouldUseDevCheckoutFallback: boolean;
  push: (href: string) => void;
  setLoading: (priceId: string | null) => void;
  setLocalCheckoutUnavailablePlanId: (planId: string | null) => void;
  checkoutOverrides?: { email?: string; userId?: string };
}) {
  if (args.isPilotMode) return;

  args.setLoading(args.priceId);
  args.setLocalCheckoutUnavailablePlanId(null);
  try {
    if (args.isBillingTestMode) {
      trackMembershipCheckoutOpened({
        locale: args.locale,
        planId: args.planId,
        userId: args.checkoutOverrides?.userId ?? args.userId,
      });
      await redirectToSimulatedSuccess({
        planId: args.planId,
        priceId: args.priceId,
        includeBillingTestFlag: true,
        push: args.push,
      });
      return;
    }

    if (args.shouldUseDevCheckoutFallback) {
      console.warn('Paddle client token missing in development, checkout is unavailable locally.');
      args.setLocalCheckoutUnavailablePlanId(args.planId);
      return;
    }

    await openPaddleCheckout({
      checkoutConfig: args.checkoutConfig,
      locale: args.locale,
      email: args.email,
      userId: args.userId,
      tenantId: args.tenantId,
      planId: args.planId,
      priceId: args.priceId,
      checkoutEmail: args.checkoutOverrides?.email,
      checkoutUserId: args.checkoutOverrides?.userId,
    });
  } catch (error) {
    console.error('Checkout error:', error);
  } finally {
    args.setLoading(null);
  }
}
