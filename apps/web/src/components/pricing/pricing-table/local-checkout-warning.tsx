'use client';

import type { LocalCheckoutWarningProps } from './types';

export function LocalCheckoutWarning({ plan, t }: LocalCheckoutWarningProps) {
  return (
    <section
      data-testid="pricing-local-checkout-unavailable"
      className="mx-auto max-w-4xl rounded-[2rem] border border-amber-200 bg-amber-50/80 p-6 shadow-sm"
    >
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-800">
        {t('localCheckout.title')}
      </p>
      <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
        {t('localCheckout.body', { planName: plan.name })}
      </p>
    </section>
  );
}
