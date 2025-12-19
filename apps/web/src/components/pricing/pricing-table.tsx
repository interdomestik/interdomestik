'use client';

import { getPaddleInstance } from '@/lib/paddle';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface PricingTableProps {
  userId: string;
  email: string;
}

// TODO: Replace with real Paddle Price IDs from your Dashboard (Sandbox/Production)
const PLANS = [
  {
    priceId: 'pri_01jk_placeholder_basic',
    name: 'Basic',
    price: 'Free',
    description: 'Essential claim tracking.',
    features: ['1 Active Claim', 'Basic Status Updates', 'Email Support'],
    buttonText: 'Current Plan',
    disabled: true,
  },
  {
    priceId: 'pri_01jk_placeholder_pro',
    name: 'Pro',
    price: '€9.99/mo',
    description: 'For serious peace of mind.',
    features: ['Unlimited Claims', 'Priority Support', 'Legal Assistance', 'WhatsApp Updates'],
    buttonText: 'Upgrade to Pro',
    disabled: false,
  },
];

export function PricingTable({ userId, email }: PricingTableProps) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async (priceId: string) => {
    setLoading(true);
    try {
      const paddle = await getPaddleInstance();
      if (paddle) {
        paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          customer: { email },
          customData: { userId },
          settings: {
            displayMode: 'overlay',
            theme: 'light',
            locale: 'en', // Could be dynamic based on props
          },
        });
      } else {
        console.error('Paddle not initialized');
        alert('Payment system unavailable. Please check configuration.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      // We don't verify success here, webhook handles it.
      // Checkout closes automatically or redirects.
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
      {PLANS.map(plan => (
        <Card
          key={plan.name}
          className={`flex flex-col ${plan.name === 'Pro' ? 'border-primary shadow-lg scale-105' : ''}`}
        >
          <CardHeader>
            <CardTitle className="text-2xl">{plan.name}</CardTitle>
            <div className="text-3xl font-bold mt-2">{plan.price}</div>
            <CardDescription>{plan.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3">
              {plan.features.map(feature => (
                <li key={feature} className="flex items-center text-sm text-muted-foreground">
                  <Check className="h-4 w-4 mr-2 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              variant={plan.name === 'Pro' ? 'default' : 'outline'}
              disabled={plan.disabled || loading}
              onClick={() => !plan.disabled && handleCheckout(plan.priceId)}
            >
              {loading && plan.name === 'Pro' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {plan.buttonText}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
