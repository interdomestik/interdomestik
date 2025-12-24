'use client';

import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
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
      monthlyPrice: t('standard.monthlyPrice'),
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
      monthlyPrice: t('family.monthlyPrice'),
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
      monthlyPrice: t('business.monthlyPrice'),
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
    <section id="pricing" className="py-24 lg:py-40 relative overflow-hidden bg-white">
      {/* Prime Background Orbs */}
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[140px] -translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-[160px] translate-x-1/4 pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10 text-center">
        {/* Prime Lvl 2 Headline */}
        <div className="mb-16 lg:mb-24 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-slate-200/50 shadow-sm transition-all text-balance">
            <Users className="h-3 w-3 text-primary" />
            {t('title')}
          </div>
          <h2 className="font-display font-black mb-12 text-slate-900 tracking-tight leading-[0.9] animate-fade-in uppercase">
            <span className="text-2xl md:text-3xl lg:text-4xl block mb-3 text-slate-800 font-bold">
              {t('mainHeading1')}
            </span>
            <span className="text-5xl md:text-6xl lg:text-7xl block leading-[0.85] tracking-[-0.05em] text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              {t('mainHeading2')}
            </span>
          </h2>
          <p className="text-slate-800 max-w-2xl mx-auto text-base md:text-lg font-medium leading-relaxed">
            {t('subtitle')}
          </p>
        </div>

        {/* Billing Toggle - Prime Style */}
        <div className="flex flex-col items-center gap-6 mb-20 animate-fade-in">
          <div className="inline-flex items-center p-1.5 rounded-3xl bg-slate-50 border border-slate-100 shadow-inner">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                !isYearly
                  ? 'bg-white text-slate-900 shadow-md border border-slate-100'
                  : 'text-slate-800 hover:text-slate-900'
              }`}
            >
              {t('monthly')}
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                isYearly
                  ? 'bg-white text-slate-900 shadow-md border border-slate-100'
                  : 'text-slate-800 hover:text-slate-900'
              }`}
            >
              {t('yearly')}
            </button>
          </div>
          {isYearly && (
            <div className="px-4 py-1 rounded-full bg-emerald-50 border border-emerald-400/30 text-emerald-950 text-[10px] font-black uppercase tracking-widest relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-200/50 to-transparent -translate-x-full animate-shimmer" />
              <span className="relative z-10">{t('yearlySaving')}</span>
            </div>
          )}
        </div>

        {/* Pricing Cards - Prime Bento Style */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 max-w-7xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.id}
              className={`group relative bg-white rounded-[2.5rem] p-10 lg:p-12 transition-all duration-500 hover:-translate-y-2 border ${
                plan.popular
                  ? 'border-primary/20 shadow-[0_40px_80px_rgba(0,0,0,0.06)]'
                  : 'border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]'
              } flex flex-col justify-between overflow-hidden text-left`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Popular Glow Effect */}
              {plan.popular && (
                <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-primary via-secondary to-accent" />
              )}

              <div
                className={`absolute -right-20 -top-20 w-80 h-80 bg-gradient-to-br ${plan.popular ? 'from-primary/10 to-secondary/10' : 'from-slate-50 to-slate-100'} opacity-0 group-hover:opacity-100 blur-3xl transition-opacity duration-700 pointer-events-none`}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-12">
                  <div
                    className={`h-16 w-16 rounded-2xl ${plan.popular ? 'bg-primary/5 text-primary' : 'bg-slate-50 text-slate-800'} flex items-center justify-center transition-all duration-500 group-hover:scale-110 border border-white/50 shadow-sm`}
                  >
                    <plan.icon className="h-8 w-8" />
                  </div>
                  {plan.popular && (
                    <span className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest shadow-lg">
                      {plan.popularLabel}
                    </span>
                  )}
                </div>

                <div className="mb-10">
                  <h3 className="text-2xl font-display font-black text-slate-900 tracking-tighter mb-4">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1.5 mb-2">
                    <span className="text-6xl font-display font-black text-slate-900 tracking-tighter leading-none">
                      {isYearly ? plan.price : plan.monthlyPrice}
                    </span>
                    <span className="text-slate-800 font-bold text-lg">
                      /{isYearly ? t('perYear') : t('perMonth')}
                    </span>
                  </div>
                  <p className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">
                    {isYearly ? t('billedAnnually') : t('billedMonthly')}
                  </p>
                  <p className="text-slate-800 text-base font-medium leading-relaxed">
                    {plan.description}
                  </p>
                </div>

                <div className="h-px w-full bg-slate-50 mb-10" />

                <ul className="space-y-4 mb-12">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex gap-4 text-sm font-medium text-slate-800">
                      <div className="mt-0.5 h-5 w-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
                        <Check className="h-3 w-3 text-emerald-900" />
                      </div>
                      <span className="leading-tight">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative z-10 w-full">
                <Link href="/register">
                  <Button
                    size="xl"
                    className={`w-full h-16 text-lg font-black rounded-2xl transition-all duration-300 ${
                      plan.popular
                        ? 'brand-gradient text-white shadow-xl shadow-primary/20 hover:scale-[1.02] border-0'
                        : 'bg-white text-slate-900 border-2 border-slate-100 hover:border-primary/20 hover:bg-slate-50'
                    }`}
                  >
                    {t('cta')}
                  </Button>
                </Link>
                <div className="mt-6 flex items-center justify-center gap-2 grayscale group-hover:opacity-60 transition-all text-slate-800 font-bold">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {t('joinSecurely')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
