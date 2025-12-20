'use client';

import { Link } from '@/i18n/routing';
import { Badge, Button } from '@interdomestik/ui';
import { Building2, Check, ShieldCheck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type Plan = {
  id: string;
  name: string;
  price: string;
  monthlyPrice: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  popularLabel?: string;
  icon: React.ElementType;
};

export function PricingSection() {
  const t = useTranslations('pricing');
  const [isYearly, setIsYearly] = useState(true);

  const plans: Plan[] = [
    {
      id: 'standard',
      name: t('standard.name'),
      price: t('standard.price'),
      monthlyPrice: '€2',
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
      popularLabel: t('standard.popular'),
      icon: ShieldCheck,
    },
    {
      id: 'family',
      name: t('family.name'),
      price: t('family.price'),
      monthlyPrice: '€5',
      period: t('family.period'),
      description: t('family.description'),
      features: [
        t('family.features.0'),
        t('family.features.1'),
        t('family.features.2'),
        t('family.features.3'),
      ],
      icon: Users,
    },
    {
      id: 'business',
      name: t('business.name'),
      price: t('business.price'),
      monthlyPrice: '€10',
      period: t('business.period'),
      description: t('business.description'),
      features: [
        t('business.features.0'),
        t('business.features.1'),
        t('business.features.2'),
        t('business.features.3'),
        t('business.features.4'),
      ],
      icon: Building2,
    },
  ];

  return (
    <section className="py-20 lg:py-28 bg-slate-50/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-black mb-4 text-slate-900 tracking-tight">
            {t('title')}
          </h2>
          <p className="text-slate-500 text-lg font-medium">{t('subtitle')}</p>
        </div>

        {/* Billing Toggle */}
        <div className="flex flex-col items-center gap-4 mb-12">
          <div className="inline-flex items-center p-1 rounded-full bg-white border border-slate-200 shadow-sm">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
                !isYearly
                  ? 'bg-primary text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('monthly')}
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
                isYearly ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('yearly')}
            </button>
          </div>
          {isYearly && (
            <Badge
              variant="secondary"
              className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold"
            >
              {t('yearlySaving')}
            </Badge>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`bg-white rounded-3xl p-8 relative transition-all duration-300 border-2 ${
                plan.popular
                  ? 'border-primary shadow-2xl shadow-primary/10 scale-[1.02] z-10'
                  : 'border-slate-100 shadow-xl hover:shadow-2xl hover:scale-[1.01]'
              }`}
            >
              {plan.popular && plan.popularLabel && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                  <span className="bg-emerald-500 text-white text-sm font-bold px-5 py-1.5 rounded-full shadow-lg">
                    {plan.popularLabel}
                  </span>
                </div>
              )}

              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div
                  className={`h-14 w-14 rounded-2xl flex items-center justify-center ${
                    plan.popular ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <plan.icon className="h-7 w-7" />
                </div>
              </div>

              {/* Plan Name */}
              <div className="text-center mb-6">
                <h3 className="text-xl font-black mb-4 text-slate-900">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-black text-slate-900 tracking-tighter">
                    {isYearly ? plan.price : plan.monthlyPrice}
                  </span>
                  <span className="text-slate-400 font-bold">{isYearly ? '/vit' : '/muaj'}</span>
                </div>
                <p className="text-xs font-bold text-primary uppercase tracking-wider mt-2">
                  {isYearly ? 'BILLED ANNUALLY' : 'BILLED MONTHLY'}
                </p>
                <p className="text-sm font-medium text-slate-500 mt-3">{plan.description}</p>
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8">
                {plan.features.map(feature => (
                  <li
                    key={feature}
                    className="flex items-center gap-3 text-sm font-medium text-slate-600"
                  >
                    <Check className="h-5 w-5 text-emerald-500 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link href="/register" className="block">
                <Button
                  size="lg"
                  variant={plan.popular ? 'default' : 'outline'}
                  className={`w-full h-12 font-bold rounded-xl ${
                    plan.popular ? 'shadow-lg shadow-primary/30' : ''
                  }`}
                >
                  {t('cta')}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
