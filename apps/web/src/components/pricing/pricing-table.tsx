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

  const PLANS = [
    {
      id: 'standard',
      priceId: 'pri_standard_year', // Replace with env var
      name: t('standard.name'),
      price: t('standard.price'),
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
    },
    {
      id: 'family',
      priceId: 'pri_family_year', // Replace with env var
      name: t('family.name'),
      price: t('family.price'),
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
    },
  ];

  const handleAction = async (planId: string, priceId: string) => {
    if (!userId) {
      // Redirect to register with plan pre-selected
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
            locale: 'en', // Should be dynamic
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
    <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
      {PLANS.map(plan => (
        <Card
          key={plan.id}
          className={`flex flex-col relative ${
            plan.popular
              ? 'border-primary shadow-2xl scale-105 z-10'
              : 'border-border shadow-md mt-4 md:mt-0'
          }`}
        >
          {plan.popular && (
            <div className="absolute -top-4 left-0 right-0 flex justify-center">
              <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1 text-sm rounded-full shadow-sm">
                {t('standard.popular')}
              </Badge>
            </div>
          )}

          <CardHeader className="text-center pb-8 pt-10">
            <div className="mx-auto bg-muted/50 p-3 rounded-full w-fit mb-4">
              <plan.icon className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-3xl">{plan.name}</CardTitle>
            <div className="flex items-baseline justify-center gap-1 mt-2">
              <span className="text-4xl font-bold">{plan.price}</span>
              <span className="text-muted-foreground text-sm">{plan.period}</span>
            </div>
            <CardDescription className="text-base mt-2">{plan.description}</CardDescription>
          </CardHeader>

          <CardContent className="flex-1">
            <ul className="space-y-4">
              {plan.features.map(feature => (
                <li key={feature} className="flex items-start text-sm">
                  <Check className="h-5 w-5 mr-3 text-primary shrink-0" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>

          <CardFooter className="pt-6 pb-8">
            <Button
              className="w-full h-11 text-base font-semibold"
              variant={plan.popular ? 'default' : 'outline'}
              disabled={loading === plan.priceId}
              onClick={() => handleAction(plan.id, plan.priceId)}
            >
              {loading === plan.priceId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('cta')}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
