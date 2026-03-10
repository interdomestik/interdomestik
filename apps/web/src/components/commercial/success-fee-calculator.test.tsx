import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SuccessFeeCalculator } from './success-fee-calculator';
import type { SuccessFeeCalculatorProps } from './success-fee-calculator-content';

const props: SuccessFeeCalculatorProps = {
  breakdownLabels: {
    feeAmount: 'Estimated fee',
    feeRate: 'Success-fee rate',
    legalActionCap: 'Legal-action cap after written opt-in',
    minimumApplied: 'Minimum applies',
    minimumFee: 'Minimum fee',
    minimumAppliedFalse: 'No',
    minimumAppliedTrue: 'Yes',
    noRecovery: 'No recovery, no fee',
    recoveryAmount: 'Recovered amount',
  },
  calculatorDescription: 'Public calculator description',
  calculatorTitle: 'Public fee calculator',
  examples: [
    {
      description: 'Standard note',
      id: 'standard',
      legalActionCap: false,
      planKey: 'standard',
      recoveryAmount: 1000,
      title: 'Standard plan example',
    },
    {
      description: 'Family note',
      id: 'family',
      legalActionCap: false,
      planKey: 'family',
      recoveryAmount: 1000,
      title: 'Family plan example',
    },
    {
      description: 'Minimum note',
      id: 'minimum',
      legalActionCap: false,
      planKey: 'standard',
      recoveryAmount: 100,
      title: 'Minimum fee example',
    },
    {
      description: 'Cap note',
      id: 'legal-action-cap',
      legalActionCap: true,
      planKey: 'standard',
      recoveryAmount: 4000,
      title: 'Legal-action cap example',
    },
  ],
  examplesSubtitle: 'Worked example subtitle',
  examplesTitle: 'Worked examples before escalation',
  footerBody: 'Cap footer body',
  footerTitle: 'Cap footer title',
  locale: 'en',
  planInputLabel: 'Membership plan',
  planOptions: [
    {
      feeRateLabel: '15%',
      key: 'standard',
      label: 'Asistenca',
      legalActionCapLabel: '25% cap with written opt-in',
      legalActionCapRate: 25,
      minimumFee: 25,
      minimumFeeLabel: 'EUR 25 minimum',
      ratePercentage: 15,
    },
    {
      feeRateLabel: '12%',
      key: 'family',
      label: 'Asistenca+ Family',
      legalActionCapLabel: '22% cap with written opt-in',
      legalActionCapRate: 22,
      minimumFee: 25,
      minimumFeeLabel: 'EUR 25 minimum',
      ratePercentage: 12,
    },
  ],
  recoveryAmountLabel: 'Recovered amount (€)',
  sectionTestId: 'test-success-fee-calculator',
  subtitle: 'See the fee math before escalation.',
  title: 'Success-fee calculator',
};

describe('SuccessFeeCalculator', () => {
  it('updates the estimated fee when the selected plan changes', () => {
    render(<SuccessFeeCalculator {...props} />);

    expect(screen.getByTestId('success-fee-current-fee')).toHaveTextContent('EUR 150');

    fireEvent.click(screen.getByRole('button', { name: 'Asistenca+ Family' }));

    expect(screen.getByTestId('success-fee-current-fee')).toHaveTextContent('EUR 120');
  });

  it('shows when the minimum fee applies for a smaller recovery amount', () => {
    render(<SuccessFeeCalculator {...props} />);

    fireEvent.change(screen.getByLabelText('Recovered amount (€)'), {
      target: { value: '100' },
    });

    expect(screen.getByTestId('success-fee-current-fee')).toHaveTextContent('EUR 25');
    expect(screen.getByTestId('success-fee-minimum-applies')).toHaveTextContent('Yes');
  });
});
