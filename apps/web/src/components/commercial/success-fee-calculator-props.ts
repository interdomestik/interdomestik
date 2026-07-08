import type {
  EntityDisclosureNoticeLabels,
  EntityDisclosureNoticeModel,
} from './entity-disclosure-notice';
import { getFeeMathSheetCopy, getFeeMathSheetNetAmountLabel } from './fee-math-sheet-copy';
import {
  PLAN_CONFIGS,
  type SuccessFeeCalculatorProps,
  type SuccessFeePlanKey,
  type SuccessFeeWorkedExample,
} from './success-fee-calculator-content';

type SuccessFeeCalculatorTranslator = (key: string) => string;

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

export function buildSuccessFeeCalculatorProps(
  t: SuccessFeeCalculatorTranslator,
  sectionTestId: NonNullable<SuccessFeeCalculatorProps['sectionTestId']>,
  locale: string,
  options: Readonly<{
    entityDisclosure?: EntityDisclosureNoticeModel | null;
    entityDisclosureLabels: EntityDisclosureNoticeLabels;
  }>
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
      userNetAmount: getFeeMathSheetNetAmountLabel(locale),
    },
    calculatorDescription: t('successFeeCalculator.calculator.description'),
    calculatorTitle: t('successFeeCalculator.calculator.title'),
    entityDisclosure: options.entityDisclosure ?? null,
    entityDisclosureLabels: options.entityDisclosureLabels,
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
    feeMathSheetCopy: getFeeMathSheetCopy(locale),
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
