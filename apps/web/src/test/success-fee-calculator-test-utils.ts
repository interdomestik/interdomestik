import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';

import { buildSuccessFeeCalculatorProps } from '@/components/commercial/success-fee-calculator-props';

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
  'successFeeCalculator.calculator.breakdown.noRecovery':
    'No recovery, no success fee to Interdomestik',
  'successFeeCalculator.calculator.breakdown.recoveryAmount': 'Recovered amount',
  'successFeeCalculator.calculator.breakdown.userNetAmount': 'You receive before court costs',
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
  'successFeeCalculator.fees.body':
    'No recovery means no success fee to Interdomestik. External court-path costs are not promised as always zero; they are controlled by the written court-path agreement before the cost is created.',
  'successFeeCalculator.fees.courtPathCosts.body':
    'Court-path costs must be disclosed in writing before the case enters court.',
  'successFeeCalculator.fees.courtPathCosts.label': 'Court path is disclosed first',
  'successFeeCalculator.fees.eyebrow': 'Court-path cost treatment',
  'successFeeCalculator.fees.lossPromise.body':
    'If there is no recovery, there is no success fee to Interdomestik.',
  'successFeeCalculator.fees.lossPromise.label': 'No success fee on no recovery',
  'successFeeCalculator.fees.reimbursement.body':
    'Reimbursement for costs Interdomestik paid upfront returns to Interdomestik when awarded by court decision.',
  'successFeeCalculator.fees.reimbursement.label': 'Court-awarded reimbursement',
  'successFeeCalculator.fees.thirdPartyCosts.body':
    "Fixed court fees, decision fees, and super-expertise costs may remain the client's responsibility if agreed in writing.",
  'successFeeCalculator.fees.thirdPartyCosts.label': 'Third-party costs can remain separate',
  'successFeeCalculator.fees.title':
    'Court costs are agreed in writing before the court path starts',
  'successFeeCalculator.fees.treatmentLabel': 'Written agreement required',
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
  return buildSuccessFeeCalculatorProps(getSuccessFeeCalculatorMessage, sectionTestId, 'en', {
    entityDisclosure: {
      contractingCompany: 'Interdomestik KS LLC',
      governingLaw: 'XK',
      unavailable: false,
    },
    entityDisclosureLabels: {
      title: 'Contracting entity',
      contractingCompany: 'Contracting company',
      governingLaw: 'Governing law',
      unavailableTitle: 'Contracting entity unavailable',
      unavailableBody: 'Contact support before continuing.',
    },
  });
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
