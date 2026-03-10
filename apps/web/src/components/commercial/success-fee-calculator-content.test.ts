import { describe, expect, it } from 'vitest';

import { calculateSuccessFeeQuote } from './success-fee-calculator-content';
import {
  buildSuccessFeeCalculatorTestProps,
  getSuccessFeeCalculatorMessage,
} from '@/test/success-fee-calculator-test-utils';

describe('calculateSuccessFeeQuote', () => {
  it('returns the standard plan fee for a recovered amount above the minimum threshold', () => {
    expect(calculateSuccessFeeQuote('standard', 1000)).toMatchObject({
      feeAmount: 150,
      minimumApplied: false,
      ratePercentage: 15,
    });
  });

  it('returns the family plan fee for a recovered amount above the minimum threshold', () => {
    expect(calculateSuccessFeeQuote('family', 1000)).toMatchObject({
      feeAmount: 120,
      minimumApplied: false,
      ratePercentage: 12,
    });
  });

  it('enforces the minimum fee when the percentage fee is lower', () => {
    expect(calculateSuccessFeeQuote('standard', 100)).toMatchObject({
      feeAmount: 25,
      minimumApplied: true,
      percentageFeeAmount: 15,
    });
  });

  it('uses the legal-action cap rate when that example is requested', () => {
    expect(calculateSuccessFeeQuote('standard', 4000, { legalActionCap: true })).toMatchObject({
      feeAmount: 1000,
      minimumApplied: false,
      ratePercentage: 25,
    });
  });

  it('does not apply the minimum fee when calculating the legal-action cap ceiling', () => {
    expect(calculateSuccessFeeQuote('standard', 50, { legalActionCap: true })).toMatchObject({
      feeAmount: 12.5,
      minimumApplied: false,
      percentageFeeAmount: 12.5,
      ratePercentage: 25,
    });
  });
});

describe('buildSuccessFeeCalculatorProps', () => {
  it('builds the shared public calculator content and worked examples from translation keys', () => {
    const props = buildSuccessFeeCalculatorTestProps('pricing-success-fee-calculator');

    expect(props.sectionTestId).toBe('pricing-success-fee-calculator');
    expect(props.title).toBe(getSuccessFeeCalculatorMessage('successFeeCalculator.title'));
    expect(props.subtitle).toBe(getSuccessFeeCalculatorMessage('successFeeCalculator.subtitle'));
    expect(props.planOptions).toHaveLength(2);
    expect(props.planOptions[0]).toMatchObject({
      key: 'standard',
      legalActionCapRate: 25,
      minimumFee: 25,
      ratePercentage: 15,
    });
    expect(props.planOptions[1]).toMatchObject({
      key: 'family',
      legalActionCapRate: 22,
      minimumFee: 25,
      ratePercentage: 12,
    });
    expect(props.examples.map(example => example.id)).toEqual([
      'standard',
      'family',
      'minimum',
      'legal-action-cap',
    ]);
    expect(props.examples[3]).toMatchObject({
      legalActionCap: true,
      planKey: 'standard',
      recoveryAmount: 4000,
      title: getSuccessFeeCalculatorMessage('successFeeCalculator.examples.legalActionCap.title'),
    });
  });
});
