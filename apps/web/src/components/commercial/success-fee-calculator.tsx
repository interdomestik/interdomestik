'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Calculator } from 'lucide-react';
import { useState } from 'react';

import { EntityDisclosureNotice } from './entity-disclosure-notice';
import { FeeMathSheetDisclosure } from './fee-math-sheet-disclosure';
import { SuccessFeeBreakdown } from './success-fee-calculator-breakdown';
import { SuccessFeeExamples } from './success-fee-calculator-examples';
import { SuccessFeePlanForm } from './success-fee-calculator-plan-form';
import { parseRecoveryAmount } from './success-fee-calculator-format';
import {
  calculateSuccessFeeQuote,
  type SuccessFeeCalculatorProps,
  type SuccessFeePlanKey,
} from './success-fee-calculator-content';

export function SuccessFeeCalculator({
  breakdownLabels,
  calculatorDescription,
  calculatorTitle,
  entityDisclosure,
  entityDisclosureLabels,
  examples,
  examplesSubtitle,
  examplesTitle,
  feeMathSheetCopy,
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
          <CardContent>
            <SuccessFeePlanForm
              planInputLabel={planInputLabel}
              planOptions={planOptions}
              recoveryAmountInput={recoveryAmountInput}
              recoveryAmountLabel={recoveryAmountLabel}
              selectedPlanKey={selectedPlanKey}
              onPlanSelect={setSelectedPlanKey}
              onRecoveryAmountChange={setRecoveryAmountInput}
            />
          </CardContent>
        </Card>

        <SuccessFeeBreakdown
          breakdownLabels={breakdownLabels}
          currentQuote={currentQuote}
          legalActionCapQuote={legalActionCapQuote}
          locale={locale}
          selectedPlan={selectedPlan}
        />
      </div>

      <SuccessFeeExamples
        breakdownLabels={breakdownLabels}
        examples={examples}
        examplesSubtitle={examplesSubtitle}
        examplesTitle={examplesTitle}
        locale={locale}
        planOptions={planOptions}
      />

      <FeeMathSheetDisclosure
        context="recovery_agreement"
        copy={feeMathSheetCopy}
        locale={locale}
        sourceSurface={sectionTestId ?? 'success-fee-calculator'}
      />

      <div className="mt-6">
        <EntityDisclosureNotice
          disclosure={entityDisclosure}
          labels={entityDisclosureLabels}
          testId="fee-math-sheet-entity-disclosure"
        />
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-slate-900 bg-slate-950 px-6 py-5 text-white">
        <h3 className="text-lg font-black">{footerTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-200">{footerBody}</p>
      </div>
    </section>
  );
}
