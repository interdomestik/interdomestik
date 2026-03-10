type SuccessFeeCalculatorTranslator = (key: string) => string;

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
  }>;
  calculatorDescription: string;
  calculatorTitle: string;
  examples: readonly SuccessFeeWorkedExample[];
  examplesSubtitle: string;
  examplesTitle: string;
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

const PLAN_CONFIGS: Record<SuccessFeePlanKey, SuccessFeePlanConfig> = {
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

const WORKED_EXAMPLES: readonly Readonly<{
  id: SuccessFeeWorkedExample['id'];
  key: 'standard' | 'family' | 'minimum' | 'legalActionCap';
  legalActionCap: boolean;
  planKey: SuccessFeePlanKey;
  recoveryAmount: number;
}>[] = [
  {
    id: 'standard',
    key: 'standard',
    legalActionCap: false,
    planKey: 'standard',
    recoveryAmount: 1000,
  },
  { id: 'family', key: 'family', legalActionCap: false, planKey: 'family', recoveryAmount: 1000 },
  {
    id: 'minimum',
    key: 'minimum',
    legalActionCap: false,
    planKey: 'standard',
    recoveryAmount: 100,
  },
  {
    id: 'legal-action-cap',
    key: 'legalActionCap',
    legalActionCap: true,
    planKey: 'standard',
    recoveryAmount: 4000,
  },
] as const;

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

export function buildSuccessFeeCalculatorProps(
  t: SuccessFeeCalculatorTranslator,
  sectionTestId: NonNullable<SuccessFeeCalculatorProps['sectionTestId']>,
  locale: string
): SuccessFeeCalculatorProps {
  return {
    breakdownLabels: {
      feeAmount: t('successFeeCalculator.calculator.breakdown.feeAmount'),
      feeRate: t('successFeeCalculator.calculator.breakdown.feeRate'),
      legalActionCap: t('successFeeCalculator.calculator.breakdown.legalActionCap'),
      minimumApplied: t('successFeeCalculator.calculator.breakdown.minimumApplied'),
      minimumAppliedFalse: t('successFeeCalculator.calculator.breakdown.minimumAppliedFalse'),
      minimumAppliedTrue: t('successFeeCalculator.calculator.breakdown.minimumAppliedTrue'),
      minimumFee: t('successFeeCalculator.calculator.breakdown.minimumFee'),
      noRecovery: t('successFeeCalculator.calculator.breakdown.noRecovery'),
      recoveryAmount: t('successFeeCalculator.calculator.breakdown.recoveryAmount'),
    },
    calculatorDescription: t('successFeeCalculator.calculator.description'),
    calculatorTitle: t('successFeeCalculator.calculator.title'),
    examples: WORKED_EXAMPLES.map(example => ({
      description: t(`successFeeCalculator.examples.${example.key}.description`),
      id: example.id,
      legalActionCap: example.legalActionCap,
      planKey: example.planKey,
      recoveryAmount: example.recoveryAmount,
      title: t(`successFeeCalculator.examples.${example.key}.title`),
    })),
    examplesSubtitle: t('successFeeCalculator.examplesSubtitle'),
    examplesTitle: t('successFeeCalculator.examplesTitle'),
    footerBody: t('successFeeCalculator.footer.body'),
    footerTitle: t('successFeeCalculator.footer.title'),
    locale,
    planInputLabel: t('successFeeCalculator.calculator.planLabel'),
    planOptions: (['standard', 'family'] as const).map(planKey => ({
      feeRateLabel: t(`successFeeCalculator.plans.${planKey}.feeRate`),
      key: planKey,
      label: t(`successFeeCalculator.plans.${planKey}.label`),
      legalActionCapLabel: t(`successFeeCalculator.plans.${planKey}.legalActionCap`),
      legalActionCapRate: PLAN_CONFIGS[planKey].legalActionCapRate,
      minimumFee: PLAN_CONFIGS[planKey].minimumFee,
      minimumFeeLabel: t(`successFeeCalculator.plans.${planKey}.minimumFee`),
      ratePercentage: PLAN_CONFIGS[planKey].ratePercentage,
    })),
    recoveryAmountLabel: t('successFeeCalculator.calculator.amountLabel'),
    sectionTestId,
    subtitle: t('successFeeCalculator.subtitle'),
    title: t('successFeeCalculator.title'),
    eyebrow: t('successFeeCalculator.eyebrow'),
  };
}
