import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Scale, ShieldCheck } from 'lucide-react';

import { formatEuro } from './success-fee-calculator-format';
import type {
  SuccessFeeCalculatorProps,
  SuccessFeePlanOption,
  SuccessFeeQuote,
} from './success-fee-calculator-content';

type SuccessFeeBreakdownProps = Readonly<{
  breakdownLabels: SuccessFeeCalculatorProps['breakdownLabels'];
  currentQuote: SuccessFeeQuote;
  legalActionCapQuote: SuccessFeeQuote;
  locale: string;
  selectedPlan: SuccessFeePlanOption;
}>;

export function SuccessFeeBreakdown({
  breakdownLabels,
  currentQuote,
  legalActionCapQuote,
  locale,
  selectedPlan,
}: SuccessFeeBreakdownProps) {
  return (
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
        <BreakdownRow label={breakdownLabels.recoveryAmount}>
          {formatEuro(locale, currentQuote.recoveryAmount)}
        </BreakdownRow>
        <BreakdownRow label={breakdownLabels.feeRate}>{selectedPlan.feeRateLabel}</BreakdownRow>
        <BreakdownRow label={breakdownLabels.minimumFee}>
          {formatEuro(locale, currentQuote.minimumFee)}
        </BreakdownRow>
        <BreakdownRow label={breakdownLabels.feeAmount} emphasized testId="success-fee-current-fee">
          {formatEuro(locale, currentQuote.feeAmount)}
        </BreakdownRow>
        <BreakdownRow
          label={breakdownLabels.userNetAmount}
          emphasized
          testId="success-fee-net-amount"
        >
          {formatEuro(locale, currentQuote.recoveryAmount - currentQuote.feeAmount)}
        </BreakdownRow>
        <BreakdownRow label={breakdownLabels.legalActionCap} testId="success-fee-legal-action-cap">
          {formatEuro(locale, legalActionCapQuote.feeAmount)}
        </BreakdownRow>
        <BreakdownRow label={breakdownLabels.minimumApplied} testId="success-fee-minimum-applies">
          {currentQuote.minimumApplied
            ? breakdownLabels.minimumAppliedTrue
            : breakdownLabels.minimumAppliedFalse}
        </BreakdownRow>
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
  );
}

function BreakdownRow({
  children,
  emphasized = false,
  label,
  testId,
}: Readonly<{
  children: string;
  emphasized?: boolean;
  label: string;
  testId?: string;
}>) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        emphasized ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <span>{label}</span>
      <span className="font-black text-white" data-testid={testId}>
        {children}
      </span>
    </div>
  );
}
