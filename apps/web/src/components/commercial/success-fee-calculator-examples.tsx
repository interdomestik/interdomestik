import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';

import { formatEuro, getWorkedExampleFormula } from './success-fee-calculator-format';
import { calculateSuccessFeeQuote } from './success-fee-calculator-content';
import type {
  SuccessFeeCalculatorProps,
  SuccessFeePlanOption,
} from './success-fee-calculator-content';

type SuccessFeeExamplesProps = Readonly<{
  breakdownLabels: SuccessFeeCalculatorProps['breakdownLabels'];
  examples: SuccessFeeCalculatorProps['examples'];
  examplesSubtitle: string;
  examplesTitle: string;
  locale: string;
  planOptions: readonly SuccessFeePlanOption[];
}>;

export function SuccessFeeExamples({
  breakdownLabels,
  examples,
  examplesSubtitle,
  examplesTitle,
  locale,
  planOptions,
}: SuccessFeeExamplesProps) {
  return (
    <div className="mt-8">
      <div className="max-w-3xl">
        <h3 className="text-2xl font-black tracking-tight text-slate-950">{examplesTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{examplesSubtitle}</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {examples.map(example => {
          const plan = planOptions.find(option => option.key === example.planKey) ?? planOptions[0];
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
                <CardTitle className="text-xl font-black text-slate-950">{example.title}</CardTitle>
                <div className="space-y-1 text-sm leading-6 text-slate-600">
                  <p>{example.description}</p>
                  <p className="font-semibold text-slate-900">{plan.label}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-900">
                  {getWorkedExampleFormula(locale, example)}
                </div>
                <ExampleRow label={breakdownLabels.recoveryAmount}>
                  {formatEuro(locale, quote.recoveryAmount)}
                </ExampleRow>
                <ExampleRow
                  label={
                    example.legalActionCap
                      ? breakdownLabels.legalActionCap
                      : breakdownLabels.feeAmount
                  }
                >
                  {formatEuro(locale, quote.feeAmount)}
                </ExampleRow>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ExampleRow({ children, label }: Readonly<{ children: string; label: string }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
