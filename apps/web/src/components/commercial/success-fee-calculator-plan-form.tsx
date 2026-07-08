import type { SuccessFeePlanKey, SuccessFeePlanOption } from './success-fee-calculator-content';

type SuccessFeePlanFormProps = Readonly<{
  planInputLabel: string;
  planOptions: readonly SuccessFeePlanOption[];
  recoveryAmountInput: string;
  recoveryAmountLabel: string;
  selectedPlanKey: SuccessFeePlanKey;
  onPlanSelect: (planKey: SuccessFeePlanKey) => void;
  onRecoveryAmountChange: (value: string) => void;
}>;

export function SuccessFeePlanForm({
  planInputLabel,
  planOptions,
  recoveryAmountInput,
  recoveryAmountLabel,
  selectedPlanKey,
  onPlanSelect,
  onRecoveryAmountChange,
}: SuccessFeePlanFormProps) {
  return (
    <div className="space-y-6">
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
              onClick={() => onPlanSelect(plan.key)}
            >
              <div className="text-sm font-black uppercase tracking-[0.12em]">{plan.label}</div>
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
          onChange={event => onRecoveryAmountChange(event.target.value)}
        />
      </label>
    </div>
  );
}
