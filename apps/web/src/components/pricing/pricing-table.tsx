'use client';

import { getPaddleInstance } from '@/lib/paddle';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { Check, Loader2, ShieldCheck, Users } from 'lucide-react';
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
      id: 'basic',
      priceId: 'pri_basic_year',
      name: t('basic.name'),
      price: isYearly ? '€15' : '€2',
      period: isYearly ? t('basic.period') : '/month',
      description: t('basic.description'),
      features: [
        t('basic.features.0'),
        t('basic.features.1'),
        t('basic.features.2'),
        t('basic.features.3'),
        t('basic.features.4'),
      ],
      popular: false,
      icon: ShieldCheck,
      color: 'blue',
    },
    {
      id: 'standard',
      priceId: 'pri_standard_year',
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
      priceId: 'pri_family_year',
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
  ];

  const handleAction = async (planId: string, priceId: string) => {
    if (!userId) {
      router.push(`/register?plan=${planId}`);
      return;
    }

    setLoading(priceId);
    try {
      const paddle = await getPaddleInstance();
      if (paddle) {
        paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          customer: email ? { email } : undefined,
          customData: { userId },
          settings: {
            displayMode: 'overlay',
            theme: 'light',
            locale: 'en',
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
        <div className="flex items-center p-1 bg-muted rounded-full border shadow-inner">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              !isYearly
                ? 'bg-white shadow-sm text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('monthly')}
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              isYearly
                ? 'bg-white shadow-sm text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('yearly')}
          </button>
        </div>
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          {t('switchLabel')}
        </Badge>
      </div>

      <div className="grid gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto px-4">
        {PLANS.map(plan => (
          <Card
            key={plan.id}
            className={`flex flex-col transition-all duration-300 hover:scale-[1.02] ${
              plan.popular
                ? 'border-primary/50 shadow-2xl bg-gradient-to-b from-primary/[0.03] to-white relative mt-4 lg:mt-0 lg:scale-105 z-10'
                : 'border-border shadow-md bg-white hover:shadow-xl'
            } ${plan.id === 'family' && 'md:col-span-2 lg:col-span-1'}`} // Center family plan on tablet if needed
          >
            {plan.popular && (
              <div className="absolute -top-4 left-0 right-0 flex justify-center">
                <Badge className="bg-primary text-primary-foreground px-4 py-1 text-xs font-bold uppercase tracking-wider rounded-full shadow-lg border-2 border-white">
                  {t('standard.popular')}
                </Badge>
              </div>
            )}

            <CardHeader className="text-center pb-8 pt-10 px-6">
              <div
                className={`mx-auto p-4 rounded-2xl w-fit mb-6 shadow-sm ${
                  plan.color === 'blue'
                    ? 'bg-blue-50 text-blue-600'
                    : plan.color === 'purple'
                      ? 'bg-purple-50 text-purple-600'
                      : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                <plan.icon className="w-8 h-8" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">{plan.name}</CardTitle>
              <div className="mt-6 flex flex-col items-center justify-center gap-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground text-sm font-medium">{plan.period}</span>
                </div>
                {isYearly && (
                  <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded">
                    Billed Annually
                  </span>
                )}
              </div>
              <CardDescription className="text-sm mt-4 px-2 leading-relaxed min-h-[3rem]">
                {plan.description}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 px-8 py-4">
              <ul className="space-y-4">
                {plan.features.map(feature => (
                  <li key={feature} className="flex items-start text-sm group">
                    <div className="mt-0.5 rounded-full bg-green-50 p-0.5 mr-3 shrink-0 transition-colors group-hover:bg-green-100">
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </div>
                    <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="pt-8 pb-10 px-8">
              <Button
                className={`w-full h-12 text-base font-bold transition-all shadow-md active:scale-95 ${
                  plan.popular
                    ? 'bg-primary hover:bg-primary/90 shadow-primary/20'
                    : 'hover:bg-accent'
                }`}
                variant={plan.popular ? 'default' : 'outline'}
                disabled={loading === plan.priceId}
                onClick={() => handleAction(plan.id, plan.priceId)}
              >
                {loading === plan.priceId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t('cta')}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
