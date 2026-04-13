'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Calculator, Scale, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import {
  calculateSuccessFeeQuote,
  type SuccessFeeCalculatorProps,
  type SuccessFeePlanKey,
  type SuccessFeePlanOption,
  type SuccessFeeWorkedExample,
} from './success-fee-calculator-content';

function getDeterministicNumberFormatLocale(locale: string) {
  return locale.toLowerCase().startsWith('en') ? 'en-US' : 'de-DE';
}

function formatEuro(locale: string, amount: number) {
  const maximumFractionDigits = Number.isInteger(amount) ? 0 : 2;

  // Browser and Node ICU support differ for some app locales (for example `sq`),
  // so this widget uses deterministic formatting to avoid hydration mismatches.
  return `EUR ${new Intl.NumberFormat(getDeterministicNumberFormatLocale(locale), {
    maximumFractionDigits,
  }).format(amount)}`;
}

function parseRecoveryAmount(input: string) {
  const amount = Number(input);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return amount;
}

function getWorkedExampleFormula(
  locale: string,
  example: SuccessFeeWorkedExample,
  plan: SuccessFeePlanOption
) {
  const quote = calculateSuccessFeeQuote(example.planKey, example.recoveryAmount, {
    legalActionCap: example.legalActionCap,
  });
  const recoveryAmount = formatEuro(locale, quote.recoveryAmount);
  const feeAmount = formatEuro(locale, quote.feeAmount);
  const minimumFee = formatEuro(locale, quote.minimumFee);

  if (example.legalActionCap) {
    return `${quote.ratePercentage}% cap x ${recoveryAmount} = ${feeAmount} max`;
  }

  if (quote.minimumApplied) {
    return `max(${quote.ratePercentage}% x ${recoveryAmount}, ${minimumFee}) = ${feeAmount}`;
  }

  return `${quote.ratePercentage}% x ${recoveryAmount} = ${feeAmount}`;
}

export function SuccessFeeCalculator({
  breakdownLabels,
  calculatorDescription,
  calculatorTitle,
  examples,
  examplesSubtitle,
  examplesTitle,
  footerBody,
  footerTitle,
  locale,
  planInputLabel,
  planOptions,
  recoveryAmountLabel,
  sectionTestId,
  subtitle,
  title,
  eyebrow,
}: SuccessFeeCalculatorProps) {
  const [selectedPlanKey, setSelectedPlanKey] = useState<SuccessFeePlanKey>(
    planOptions[0]?.key ?? 'standard'
  );
  const [recoveryAmountInput, setRecoveryAmountInput] = useState('1000');

  if (planOptions.length === 0) {
    return null;
  }

  const selectedPlan = planOptions.find(plan => plan.key === selectedPlanKey) ?? planOptions[0];
  const recoveryAmount = parseRecoveryAmount(recoveryAmountInput);
  const currentQuote = calculateSuccessFeeQuote(selectedPlan.key, recoveryAmount);
  const legalActionCapQuote = calculateSuccessFeeQuote(selectedPlan.key, recoveryAmount, {
    legalActionCap: true,
  });

  return (
    <section
      className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-6 shadow-sm md:p-8"
      data-testid={sectionTestId}
    >
      <div className="mx-auto max-w-4xl text-center">
        {eyebrow ? (
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        ) : null}
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">{subtitle}</p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="rounded-[1.75rem] border border-slate-200 bg-white/90 shadow-none">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <Calculator className="h-5 w-5 text-slate-700" />
              </div>
              <div className="text-left">
                <CardTitle className="text-xl font-black text-slate-950">
                  {calculatorTitle}
                </CardTitle>
                <p className="mt-1 text-sm leading-6 text-slate-600">{calculatorDescription}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <fieldset>
              <legend className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">
                {planInputLabel}
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {planOptions.map(plan => (
                  <button
                    key={plan.key}
                    type="button"
                    aria-pressed={selectedPlanKey === plan.key}
                    aria-label={plan.label}
                    className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                      selectedPlanKey === plan.key
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-900'
                    }`}
                    onClick={() => setSelectedPlanKey(plan.key)}
                  >
                    <div className="text-sm font-black uppercase tracking-[0.12em]">
                      {plan.label}
                    </div>
                    <div className="mt-2 text-sm">{plan.feeRateLabel}</div>
                    <div className="mt-1 text-sm">{plan.minimumFeeLabel}</div>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block text-left" htmlFor="success-fee-recovery-amount">
              <span className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">
                {recoveryAmountLabel}
              </span>
              <input
                id="success-fee-recovery-amount"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                className="mt-3 w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                value={recoveryAmountInput}
                onChange={event => setRecoveryAmountInput(event.target.value)}
              />
            </label>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border border-slate-200 bg-slate-950 text-white shadow-none">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <Scale className="h-5 w-5 text-slate-100" />
              </div>
              <CardTitle className="text-xl font-black">{breakdownLabels.feeAmount}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-200">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span>{breakdownLabels.recoveryAmount}</span>
              <span className="font-black text-white">
                {formatEuro(locale, currentQuote.recoveryAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span>{breakdownLabels.feeRate}</span>
              <span className="font-black text-white">{selectedPlan.feeRateLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span>{breakdownLabels.minimumFee}</span>
              <span className="font-black text-white">
                {formatEuro(locale, currentQuote.minimumFee)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
              <span>{breakdownLabels.feeAmount}</span>
              <span className="font-black text-white" data-testid="success-fee-current-fee">
                {formatEuro(locale, currentQuote.feeAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span>{breakdownLabels.legalActionCap}</span>
              <span className="font-black text-white" data-testid="success-fee-legal-action-cap">
                {formatEuro(locale, legalActionCapQuote.feeAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span>{breakdownLabels.minimumApplied}</span>
              <span className="font-black text-white" data-testid="success-fee-minimum-applies">
                {currentQuote.minimumApplied
                  ? breakdownLabels.minimumAppliedTrue
                  : breakdownLabels.minimumAppliedFalse}
              </span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-slate-100">
                <ShieldCheck className="h-4 w-4" />
                {breakdownLabels.noRecovery}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {selectedPlan.legalActionCapLabel}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <div className="max-w-3xl">
          <h3 className="text-2xl font-black tracking-tight text-slate-950">{examplesTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{examplesSubtitle}</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {examples.map(example => {
            const plan =
              planOptions.find(option => option.key === example.planKey) ?? planOptions[0];
            const quote = calculateSuccessFeeQuote(example.planKey, example.recoveryAmount, {
              legalActionCap: example.legalActionCap,
            });

            return (
              <Card
                key={example.id}
                className="rounded-[1.75rem] border border-slate-200 bg-white/90 shadow-none"
                data-testid={`success-fee-example-${example.id}`}
              >
                <CardHeader className="space-y-3 pb-4">
                  <CardTitle className="text-xl font-black text-slate-950">
                    {example.title}
                  </CardTitle>
                  <div className="space-y-1 text-sm leading-6 text-slate-600">
                    <p>{example.description}</p>
                    <p className="font-semibold text-slate-900">{plan.label}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-900">
                    {getWorkedExampleFormula(locale, example, plan)}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{breakdownLabels.recoveryAmount}</span>
                    <span>{formatEuro(locale, quote.recoveryAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {example.legalActionCap
                        ? breakdownLabels.legalActionCap
                        : breakdownLabels.feeAmount}
                    </span>
                    <span>{formatEuro(locale, quote.feeAmount)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-slate-900 bg-slate-950 px-6 py-5 text-white">
        <h3 className="text-lg font-black">{footerTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-200">{footerBody}</p>
      </div>
    </section>
  );
}
