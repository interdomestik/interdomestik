'use client';

import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { Check, Loader2 } from 'lucide-react';

import type { PlanCardProps } from './types';

export function PlanCard({
  plan,
  selected,
  loading,
  disabled,
  renderBusinessMembershipLink,
  colorClass,
  billedAnnuallyLabel,
  popularLabel,
  ctaLabel,
  onClick,
}: PlanCardProps) {
  const PlanIcon = plan.icon;

  return (
    <div
      data-testid={`plan-card-${plan.id}`}
      data-selected-plan={selected ? '1' : '0'}
      className={`bg-white rounded-[2rem] p-10 relative transition-all duration-300 border-2 ${
        plan.popular
          ? 'border-primary shadow-2xl shadow-primary/10 md:scale-105 z-10'
          : 'border-slate-100 shadow-xl'
      } ${selected ? 'ring-2 ring-primary/40 ring-offset-2' : ''}`}
    >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
          <span className="bg-primary text-white text-sm font-bold px-6 py-1.5 rounded-full shadow-lg border-2 border-white">
            {popularLabel}
          </span>
        </div>
      )}

      <div className="text-center mb-10">
        <div className={`mx-auto p-4 rounded-2xl w-fit mb-6 shadow-sm ${colorClass}`}>
          <PlanIcon className="w-10 h-10" />
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
            {billedAnnuallyLabel}
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
        disabled={disabled}
        asChild={renderBusinessMembershipLink}
        onClick={!disabled && !renderBusinessMembershipLink ? onClick : undefined}
      >
        {renderBusinessMembershipLink ? (
          <Link href="/business-membership">{ctaLabel}</Link>
        ) : (
          <>
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {ctaLabel}
          </>
        )}
      </Button>
    </div>
  );
}
