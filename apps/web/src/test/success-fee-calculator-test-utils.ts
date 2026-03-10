import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';

import { buildSuccessFeeCalculatorProps } from '@/components/commercial/success-fee-calculator-content';

type SuccessFeeCalculatorAssertion = Readonly<{
  sectionTestId: string;
}>;

const successFeeCalculatorMessages = {
  'successFeeCalculator.calculator.amountLabel': 'Recovered amount (€)',
  'successFeeCalculator.calculator.breakdown.feeAmount': 'Estimated fee',
  'successFeeCalculator.calculator.breakdown.feeRate': 'Success-fee rate',
  'successFeeCalculator.calculator.breakdown.legalActionCap':
    'Legal-action cap after written opt-in',
  'successFeeCalculator.calculator.breakdown.minimumApplied': 'Minimum applies',
  'successFeeCalculator.calculator.breakdown.minimumAppliedFalse': 'No',
  'successFeeCalculator.calculator.breakdown.minimumAppliedTrue': 'Yes',
  'successFeeCalculator.calculator.breakdown.minimumFee': 'Minimum fee',
  'successFeeCalculator.calculator.breakdown.noRecovery': 'No recovery, no fee',
  'successFeeCalculator.calculator.breakdown.recoveryAmount': 'Recovered amount',
  'successFeeCalculator.calculator.description': 'Public calculator description',
  'successFeeCalculator.calculator.planLabel': 'Membership plan',
  'successFeeCalculator.calculator.title': 'Public fee calculator',
  'successFeeCalculator.examples.family.description': 'Family note',
  'successFeeCalculator.examples.family.title': 'Family plan example',
  'successFeeCalculator.examples.legalActionCap.description': 'Cap note',
  'successFeeCalculator.examples.legalActionCap.title': 'Legal-action cap example',
  'successFeeCalculator.examples.minimum.description': 'Minimum note',
  'successFeeCalculator.examples.minimum.title': 'Minimum fee example',
  'successFeeCalculator.examples.standard.description': 'Standard note',
  'successFeeCalculator.examples.standard.title': 'Standard plan example',
  'successFeeCalculator.examplesSubtitle': 'Worked example subtitle',
  'successFeeCalculator.examplesTitle': 'Worked examples before escalation',
  'successFeeCalculator.eyebrow': 'Before escalation',
  'successFeeCalculator.footer.body': 'Cap footer body',
  'successFeeCalculator.footer.title': 'Cap footer title',
  'successFeeCalculator.plans.family.feeRate': '12%',
  'successFeeCalculator.plans.family.label': 'Asistenca+ Family',
  'successFeeCalculator.plans.family.legalActionCap': '22% cap with written opt-in',
  'successFeeCalculator.plans.family.minimumFee': 'EUR 25 minimum',
  'successFeeCalculator.plans.standard.feeRate': '15%',
  'successFeeCalculator.plans.standard.label': 'Asistenca',
  'successFeeCalculator.plans.standard.legalActionCap': '25% cap with written opt-in',
  'successFeeCalculator.plans.standard.minimumFee': 'EUR 25 minimum',
  'successFeeCalculator.subtitle': 'See the fee math before escalation.',
  'successFeeCalculator.title': 'Success-fee calculator',
} satisfies Record<string, string>;

export function getSuccessFeeCalculatorMessage(key: string) {
  return successFeeCalculatorMessages[key as keyof typeof successFeeCalculatorMessages] ?? key;
}

export function buildSuccessFeeCalculatorTestProps(sectionTestId = 'test-success-fee-calculator') {
  return buildSuccessFeeCalculatorProps(getSuccessFeeCalculatorMessage, sectionTestId, 'en');
}

export function expectSuccessFeeCalculator({ sectionTestId }: SuccessFeeCalculatorAssertion) {
  const calculator = screen.getByTestId(sectionTestId);

  expect(within(calculator).getByText('pricing.successFeeCalculator.title')).toBeInTheDocument();
  expect(
    within(calculator).getByText('pricing.successFeeCalculator.examples.standard.title')
  ).toBeInTheDocument();
  expect(
    within(calculator).getByText('pricing.successFeeCalculator.examples.family.title')
  ).toBeInTheDocument();
  expect(
    within(calculator).getByText('pricing.successFeeCalculator.examples.minimum.title')
  ).toBeInTheDocument();
  expect(
    within(calculator).getByText('pricing.successFeeCalculator.examples.legalActionCap.title')
  ).toBeInTheDocument();

  return calculator;
}
