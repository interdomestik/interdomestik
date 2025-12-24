'use client';

import { PADDLE_PRICES } from '@/config/paddle';
import { getPaddleInstance } from '@/lib/paddle';
import { Badge, Button } from '@interdomestik/ui';
import { getCookie } from 'cookies-next';
import { Building2, Check, Loader2, ShieldCheck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PricingTableProps {
  userId?: string;
  email?: string;
}

export function PricingTable({ userId, email }: PricingTableProps) {
  const t = useTranslations('pricing');
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [isYearly, setIsYearly] = useState(true);

  const PLANS = [
    {
      id: 'standard',
      priceId: isYearly ? PADDLE_PRICES.standard.yearly : PADDLE_PRICES.standard.monthly,
      name: t('standard.name'),
      price: isYearly ? '€20' : '€3',
      period: isYearly ? t('standard.period') : '/month',
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
      priceId: isYearly ? PADDLE_PRICES.family.yearly : PADDLE_PRICES.family.monthly,
      name: t('family.name'),
      price: isYearly ? '€35' : '€5',
      period: isYearly ? t('family.period') : '/month',
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
      priceId: isYearly ? PADDLE_PRICES.business.yearly : PADDLE_PRICES.business.monthly,
      name: t('business.name'),
      price: isYearly ? '€95' : '€10',
      period: isYearly ? t('business.period') : '/month',
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

  const handleAction = async (planId: string, priceId: string) => {
    if (!userId) {
      router.push(`/register?plan=${planId}`);
      return;
    }

    setLoading(priceId);
    try {
      console.log('🏷️ Opening Paddle checkout with Price ID:', priceId);
      console.log('📦 Environment check:', {
        STANDARD_YEAR: process.env.NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR,
        CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      });

      const paddle = await getPaddleInstance();
      if (paddle) {
        // Check for referral cookie
        const agentId = getCookie('agent_ref');

        paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          customer: email ? { email } : undefined,
          customData: {
            userId,
            ...(agentId ? { agentId: String(agentId) } : {}),
          },
          settings: {
            displayMode: 'overlay',
            theme: 'light',
            locale: 'en',
            successUrl: `${window.location.origin}/member/membership/success`,
          },
        });
      } else {
        console.error('Paddle not initialized');
        alert('Payment system unavailable. Please check configuration.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-12">
      {/* Yearly/Monthly Toggle */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center p-1 bg-slate-100 rounded-full border border-slate-200 shadow-inner">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all ${
              !isYearly ? 'bg-white shadow-md text-primary' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t('monthly')}
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all ${
              isYearly ? 'bg-white shadow-md text-primary' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t('yearly')}
          </button>
        </div>
        <Badge
          variant="secondary"
          className="bg-green-50 text-green-700 border-green-200 font-bold px-4 py-1"
        >
          {t('switchLabel')}
        </Badge>
      </div>

      <div className="grid gap-10 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto px-4">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`bg-white rounded-[2rem] p-10 relative transition-all duration-300 border-2 ${
              plan.popular
                ? 'border-primary shadow-2xl shadow-primary/10 md:scale-105 z-10'
                : 'border-slate-100 shadow-xl'
            }`}
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
                className={`mx-auto p-4 rounded-2xl w-fit mb-6 shadow-sm ${
                  plan.color === 'blue'
                    ? 'bg-blue-50 text-blue-600'
                    : plan.color === 'purple'
                      ? 'bg-purple-50 text-purple-600'
                      : 'bg-indigo-50 text-indigo-600'
                }`}
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
                {isYearly && (
                  <span className="text-[11px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-3 py-1 rounded-md mt-2">
                    Billed Annually
                  </span>
                )}
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
              className={`w-full h-16 text-lg font-black transition-all rounded-2xl shadow-lg active:scale-95 ${
                plan.popular
                  ? 'bg-primary hover:bg-primary/90 shadow-primary/30 border-0'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-200'
              }`}
              variant={plan.popular ? 'default' : 'outline'}
              disabled={loading === plan.priceId}
              onClick={() => handleAction(plan.id, plan.priceId)}
            >
              {loading === plan.priceId ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {t('cta')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
