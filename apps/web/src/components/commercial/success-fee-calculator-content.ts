import type {
  EntityDisclosureNoticeLabels,
  EntityDisclosureNoticeModel,
} from './entity-disclosure-notice';
import type { FeeMathSheetCopy } from './fee-math-sheet-copy';

export type SuccessFeePlanKey = 'standard' | 'family';

export type SuccessFeePlanOption = Readonly<{
  feeRateLabel: string;
  key: SuccessFeePlanKey;
  label: string;
  legalActionCapLabel: string;
  legalActionCapRate: number;
  minimumFee: number;
  minimumFeeLabel: string;
  ratePercentage: number;
}>;

export type SuccessFeeWorkedExample = Readonly<{
  description: string;
  id: 'standard' | 'family' | 'minimum' | 'legal-action-cap';
  legalActionCap: boolean;
  planKey: SuccessFeePlanKey;
  recoveryAmount: number;
  title: string;
}>;

export type SuccessFeeCalculatorProps = Readonly<{
  breakdownLabels: Readonly<{
    feeAmount: string;
    feeRate: string;
    legalActionCap: string;
    minimumApplied: string;
    minimumAppliedFalse: string;
    minimumAppliedTrue: string;
    minimumFee: string;
    noRecovery: string;
    recoveryAmount: string;
    userNetAmount: string;
  }>;
  calculatorDescription: string;
  calculatorTitle: string;
  entityDisclosure?: EntityDisclosureNoticeModel | null;
  entityDisclosureLabels: EntityDisclosureNoticeLabels;
  examples: readonly SuccessFeeWorkedExample[];
  examplesSubtitle: string;
  examplesTitle: string;
  feeMathSheetCopy: FeeMathSheetCopy;
  footerBody: string;
  footerTitle: string;
  locale: string;
  planInputLabel: string;
  planOptions: readonly SuccessFeePlanOption[];
  recoveryAmountLabel: string;
  sectionTestId?: string;
  subtitle: string;
  title: string;
  eyebrow?: string;
}>;

type SuccessFeePlanConfig = Readonly<{
  legalActionCapRate: number;
  minimumFee: number;
  ratePercentage: number;
}>;

type CalculateSuccessFeeOptions = Readonly<{
  legalActionCap?: boolean;
}>;

export type SuccessFeeQuote = Readonly<{
  feeAmount: number;
  minimumApplied: boolean;
  minimumFee: number;
  percentageFeeAmount: number;
  ratePercentage: number;
  recoveryAmount: number;
}>;

export const PLAN_CONFIGS: Record<SuccessFeePlanKey, SuccessFeePlanConfig> = {
  standard: {
    legalActionCapRate: 25,
    minimumFee: 25,
    ratePercentage: 15,
  },
  family: {
    legalActionCapRate: 22,
    minimumFee: 25,
    ratePercentage: 12,
  },
};

function normalizeRecoveryAmount(recoveryAmount: number) {
  if (!Number.isFinite(recoveryAmount) || recoveryAmount <= 0) {
    return 0;
  }

  return recoveryAmount;
}

export function calculateSuccessFeeQuote(
  planKey: SuccessFeePlanKey,
  recoveryAmount: number,
  options: CalculateSuccessFeeOptions = {}
): SuccessFeeQuote {
  const plan = PLAN_CONFIGS[planKey];
  const normalizedRecoveryAmount = normalizeRecoveryAmount(recoveryAmount);
  const ratePercentage = options.legalActionCap ? plan.legalActionCapRate : plan.ratePercentage;

  if (normalizedRecoveryAmount === 0) {
    return {
      feeAmount: 0,
      minimumApplied: false,
      minimumFee: plan.minimumFee,
      percentageFeeAmount: 0,
      ratePercentage,
      recoveryAmount: normalizedRecoveryAmount,
    };
  }

  const percentageFeeAmount = (normalizedRecoveryAmount * ratePercentage) / 100;
  const feeAmount = options.legalActionCap
    ? percentageFeeAmount
    : Math.max(percentageFeeAmount, plan.minimumFee);

  return {
    feeAmount,
    minimumApplied: !options.legalActionCap && feeAmount === plan.minimumFee,
    minimumFee: plan.minimumFee,
    percentageFeeAmount,
    ratePercentage,
    recoveryAmount: normalizedRecoveryAmount,
  };
}
