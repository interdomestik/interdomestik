'use client';

import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { PADDLE_PRICES } from '@/config/paddle';
import { Link, useRouter } from '@/i18n/routing';
import { CommercialFunnelEvents } from '@/lib/analytics';
import { getPaddleInstance } from '@interdomestik/domain-membership-billing/paddle';
import { Badge, Button } from '@interdomestik/ui';
import { getCookie } from 'cookies-next';
import { Building2, Check, Loader2, ShieldCheck, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type PricingTableProps = Readonly<{
  userId?: string;
  email?: string;
  tenantId?: string | null;
  billingTestMode?: boolean;
  isSessionPending?: boolean;
}>;

const PLAN_IDS = ['standard', 'family', 'business'] as const;
const SELF_SERVE_PLAN_IDS = ['standard', 'family'] as const;

function getPaddleLocale(locale: string) {
  const normalizedLocale = locale.toLowerCase();

  if (['de', 'en', 'es', 'fr', 'it', 'nl'].includes(normalizedLocale)) {
    return normalizedLocale;
  }

  return 'en';
}

function getSelectedPlanIdFromSearch(search: string) {
  const planFromQuery = new URLSearchParams(search).get('plan')?.trim().toLowerCase() ?? '';
  return PLAN_IDS.includes(planFromQuery as (typeof PLAN_IDS)[number]) ? planFromQuery : null;
}

function getPlanColorClass(color: string) {
  if (color === 'blue') return 'bg-blue-50 text-blue-600';
  if (color === 'purple') return 'bg-purple-50 text-purple-600';
  return 'bg-indigo-50 text-indigo-600';
}

function trackMembershipCheckoutOpened(args: { locale: string; planId: string; userId?: string }) {
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

function getCheckoutAttribution(search: string) {
  const params = new URLSearchParams(search);

  const normalize = (key: string) => {
    const value = params.get(key)?.trim();
    return value || undefined;
  };

  return {
    utmSource: normalize('utm_source'),
    utmMedium: normalize('utm_medium'),
    utmCampaign: normalize('utm_campaign'),
    utmContent: normalize('utm_content'),
  };
}

function buildCheckoutCustomData(args: {
  userId?: string;
  agentId?: string;
  tenantId?: string | null;
  search?: string;
}) {
  const attribution = getCheckoutAttribution(args.search ?? '');

  return {
    acquisitionSource: 'self_serve_web',
    ...(args.userId ? { userId: args.userId } : {}),
    ...(args.agentId ? { agentId: args.agentId } : {}),
    ...(args.tenantId ? { tenantId: args.tenantId } : {}),
    ...(attribution.utmSource ? { utmSource: attribution.utmSource } : {}),
    ...(attribution.utmMedium ? { utmMedium: attribution.utmMedium } : {}),
    ...(attribution.utmCampaign ? { utmCampaign: attribution.utmCampaign } : {}),
    ...(attribution.utmContent ? { utmContent: attribution.utmContent } : {}),
  };
}

export function PricingTable({
  userId,
  email,
  tenantId,
  billingTestMode,
  isSessionPending = false,
}: PricingTableProps) {
  const t = useTranslations('pricing');
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [preCheckoutPlanId, setPreCheckoutPlanId] = useState<string | null>(null);
  const preCheckoutSectionRef = useRef<HTMLElement | null>(null);
  const isPilotMode = process.env.NEXT_PUBLIC_PILOT_MODE === 'true';

  const PLANS = [
    {
      id: 'standard',
      priceId: PADDLE_PRICES.standard.yearly,
      name: t('standard.name'),
      price: '€20',
      period: t('standard.period'),
      description: t('standard.description'),
      features: [
        t('standard.features.0'),
        t('standard.features.1'),
        t('standard.features.2'),
        t('standard.features.3'),
        t('standard.features.4'),
        t('standard.features.5'),
      ],
      popular: true,
      icon: ShieldCheck,
      color: 'indigo',
    },
    {
      id: 'family',
      priceId: PADDLE_PRICES.family.yearly,
      name: t('family.name'),
      price: '€35',
      period: t('family.period'),
      description: t('family.description'),
      features: [
        t('family.features.0'),
        t('family.features.1'),
        t('family.features.2'),
        t('family.features.3'),
      ],
      popular: false,
      icon: Users,
      color: 'purple',
    },
    {
      id: 'business',
      priceId: PADDLE_PRICES.business.yearly,
      name: t('business.name'),
      price: '€95',
      period: t('business.period'),
      description: t('business.description'),
      features: [
        t('business.features.0'),
        t('business.features.1'),
        t('business.features.2'),
        t('business.features.3'),
        t('business.features.4'),
      ],
      popular: false,
      icon: Building2,
      color: 'blue',
    },
  ];

  const isBillingTestMode = billingTestMode ?? process.env.NEXT_PUBLIC_BILLING_TEST_MODE === '1';
  const paddleClientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() ?? '';
  const normalizedPaddleClientToken = paddleClientToken.toLowerCase();
  const hasPaddleClientToken =
    paddleClientToken.length > 0 &&
    !normalizedPaddleClientToken.includes('...') &&
    !normalizedPaddleClientToken.includes('***') &&
    !normalizedPaddleClientToken.includes('your_client_token_here');
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

  const redirectToSimulatedSuccess = async (
    planId: string,
    priceId: string,
    includeBillingTestFlag: boolean
  ) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const params = new URLSearchParams();
    if (includeBillingTestFlag) {
      params.set('test', 'true');
    }
    params.set('priceId', priceId);
    params.set('planId', planId);
    router.push(`/member/membership/success?${params.toString()}`);
  };

  const openPaddleCheckout = async (args: { planId: string; priceId: string }) => {
    const paddle = await getPaddleInstance();

    if (!paddle) {
      console.error('Paddle not initialized');
      toast.error('Payment system unavailable. Please check configuration.');
      return;
    }

    const agentId = getCookie('agent_ref');

    trackMembershipCheckoutOpened({
      locale,
      planId: args.planId,
      userId,
    });

    paddle.Checkout.open({
      items: [{ priceId: args.priceId, quantity: 1 }],
      customer: email ? { email } : undefined,
      customData: buildCheckoutCustomData({
        userId,
        agentId: agentId ? String(agentId) : undefined,
        tenantId,
        search: globalThis.location.search,
      }),
      settings: {
        displayMode: 'overlay',
        theme: 'light',
        locale: getPaddleLocale(locale),
        successUrl: `${globalThis.location.origin}/${locale}/member/membership/success`,
      },
    });
  };

  const handleAction = async (planId: string, priceId: string) => {
    if (process.env.NEXT_PUBLIC_PILOT_MODE === 'true') return;

    setLoading(priceId);
    try {
      if (isBillingTestMode || shouldUseDevCheckoutFallback) {
        trackMembershipCheckoutOpened({
          locale,
          planId,
          userId,
        });
        if (shouldUseDevCheckoutFallback) {
          console.warn(
            'Paddle client token missing in development, falling back to simulated checkout.'
          );
        }
        await redirectToSimulatedSuccess(planId, priceId, isBillingTestMode);
        return;
      }

      await openPaddleCheckout({ planId, priceId });
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(null);
    }
  };

  const preCheckoutPlan = PLANS.find(plan => plan.id === preCheckoutPlanId) ?? null;

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

      <div className="grid gap-10 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto px-4">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            data-testid={`plan-card-${plan.id}`}
            data-selected-plan={selectedPlanId === plan.id ? '1' : '0'}
            className={`bg-white rounded-[2rem] p-10 relative transition-all duration-300 border-2 ${
              plan.popular
                ? 'border-primary shadow-2xl shadow-primary/10 md:scale-105 z-10'
                : 'border-slate-100 shadow-xl'
            } ${selectedPlanId === plan.id ? 'ring-2 ring-primary/40 ring-offset-2' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                <span className="bg-primary text-white text-sm font-bold px-6 py-1.5 rounded-full shadow-lg border-2 border-white">
                  {t('standard.popular')}
                </span>
              </div>
            )}

            <div className="text-center mb-10">
              <div
                className={`mx-auto p-4 rounded-2xl w-fit mb-6 shadow-sm ${getPlanColorClass(
                  plan.color
                )}`}
              >
                <plan.icon className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black mb-3 text-slate-900">{plan.name}</h3>
              <div className="mt-4 flex flex-col items-center justify-center gap-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-6xl font-black text-slate-900 tracking-tighter">
                    {plan.price}
                  </span>
                  <span className="text-slate-400 font-bold text-lg">{plan.period}</span>
                </div>
                <span className="text-[11px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-3 py-1 rounded-md mt-2">
                  {t('billedAnnually')}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-500 mt-6 px-4 leading-relaxed">
                {plan.description}
              </p>
            </div>

            <ul className="space-y-4 mb-12">
              {plan.features.map(feature => (
                <li
                  key={feature}
                  className="flex items-start text-[15px] font-medium text-slate-600 group"
                >
                  <div className="mt-1 rounded-full bg-green-50 p-0.5 mr-4 shrink-0 transition-colors group-hover:bg-green-100">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="group-hover:text-slate-900 transition-colors">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              size="xl"
              data-testid={`plan-cta-${plan.id}`}
              className={`w-full h-16 min-h-[44px] touch-manipulation text-lg font-black transition-all rounded-2xl shadow-lg active:scale-95 ${
                plan.popular
                  ? 'bg-primary hover:bg-primary/90 shadow-primary/30 border-0'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-200'
              }`}
              variant={plan.popular ? 'default' : 'outline'}
              disabled={isPilotMode || isSessionPending || loading === plan.priceId}
              asChild={!userId && plan.id === 'business' && !isPilotMode && !isSessionPending}
              onClick={
                !isPilotMode && !isSessionPending
                  ? () => {
                      CommercialFunnelEvents.pricingPlanCtaClicked(
                        {
                          tenantId: null,
                          variant: 'hero_v1',
                          locale,
                        },
                        {
                          plan_id: plan.id,
                          flow_entry: userId ? 'logged_in_member' : 'anonymous_public',
                          plan_type: SELF_SERVE_PLAN_IDS.includes(plan.id as 'standard' | 'family')
                            ? 'self_serve'
                            : 'assisted',
                        }
                      );

                      if (
                        !userId &&
                        SELF_SERVE_PLAN_IDS.includes(plan.id as 'standard' | 'family')
                      ) {
                        setPreCheckoutPlanId(plan.id);
                        return;
                      }
                      handleAction(plan.id, plan.priceId);
                    }
                  : undefined
              }
            >
              {!userId && plan.id === 'business' && !isPilotMode && !isSessionPending ? (
                <Link href="/business-membership">{t('cta')}</Link>
              ) : (
                <>
                  {loading === plan.priceId ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : null}
                  {t('cta')}
                </>
              )}
            </Button>
          </div>
        ))}
      </div>

      {preCheckoutPlan ? (
        <section
          ref={preCheckoutSectionRef}
          tabIndex={-1}
          data-testid="pricing-precheckout-confirmation"
          className="mx-auto max-w-4xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">
                {t('joinSecurely')}
              </p>
              <h2 className="text-3xl font-black tracking-tight text-slate-950">
                {preCheckoutPlan.name}
              </h2>
              <p className="text-base font-medium text-slate-600">{preCheckoutPlan.description}</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-left shadow-sm lg:min-w-[280px]">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                {t('preCheckout.planSummary')}
              </p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tighter text-slate-950">
                  {preCheckoutPlan.price}
                </span>
                <span className="text-sm font-bold text-slate-500">{preCheckoutPlan.period}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-emerald-700">
                {t('preCheckout.responsePromise')}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <CommercialDisclaimerNotice
              eyebrow={t('disclaimers.eyebrow')}
              items={[
                {
                  title: t('disclaimers.freeStart.title'),
                  body: t('disclaimers.freeStart.body'),
                },
              ]}
            />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              data-testid="precheckout-continue-cta"
              className="min-h-[44px] touch-manipulation rounded-2xl px-6"
              disabled={loading === preCheckoutPlan.priceId}
              onClick={() => {
                if (!userId) {
                  router.push(`/register?plan=${preCheckoutPlan.id}`);
                  return;
                }
                handleAction(preCheckoutPlan.id, preCheckoutPlan.priceId);
              }}
            >
              {loading === preCheckoutPlan.priceId ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : null}
              {t('preCheckout.continue')}
            </Button>
            <Button
              size="lg"
              data-testid="precheckout-cancel-cta"
              variant="outline"
              className="min-h-[44px] touch-manipulation rounded-2xl px-6"
              onClick={() => setPreCheckoutPlanId(null)}
            >
              {t('preCheckout.cancel')}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
