import { describe, expect, it } from 'vitest';

import {
  buildSuccessFeeCalculatorProps,
  calculateSuccessFeeQuote,
} from './success-fee-calculator-content';

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
});

describe('buildSuccessFeeCalculatorProps', () => {
  it('builds the shared public calculator content and worked examples from translation keys', () => {
    const t = (key: string) => `translated:${key}`;

    const props = buildSuccessFeeCalculatorProps(t, 'pricing-success-fee-calculator', 'en');

    expect(props.sectionTestId).toBe('pricing-success-fee-calculator');
    expect(props.title).toBe('translated:successFeeCalculator.title');
    expect(props.subtitle).toBe('translated:successFeeCalculator.subtitle');
    expect(props.planOptions).toEqual([
      {
        feeRateLabel: 'translated:successFeeCalculator.plans.standard.feeRate',
        key: 'standard',
        label: 'translated:successFeeCalculator.plans.standard.label',
        legalActionCapLabel: 'translated:successFeeCalculator.plans.standard.legalActionCap',
        legalActionCapRate: 25,
        minimumFee: 25,
        minimumFeeLabel: 'translated:successFeeCalculator.plans.standard.minimumFee',
        ratePercentage: 15,
      },
      {
        feeRateLabel: 'translated:successFeeCalculator.plans.family.feeRate',
        key: 'family',
        label: 'translated:successFeeCalculator.plans.family.label',
        legalActionCapLabel: 'translated:successFeeCalculator.plans.family.legalActionCap',
        legalActionCapRate: 22,
        minimumFee: 25,
        minimumFeeLabel: 'translated:successFeeCalculator.plans.family.minimumFee',
        ratePercentage: 12,
      },
    ]);
    expect(props.examples).toEqual([
      {
        description: 'translated:successFeeCalculator.examples.standard.description',
        id: 'standard',
        legalActionCap: false,
        planKey: 'standard',
        recoveryAmount: 1000,
        title: 'translated:successFeeCalculator.examples.standard.title',
      },
      {
        description: 'translated:successFeeCalculator.examples.family.description',
        id: 'family',
        legalActionCap: false,
        planKey: 'family',
        recoveryAmount: 1000,
        title: 'translated:successFeeCalculator.examples.family.title',
      },
      {
        description: 'translated:successFeeCalculator.examples.minimum.description',
        id: 'minimum',
        legalActionCap: false,
        planKey: 'standard',
        recoveryAmount: 100,
        title: 'translated:successFeeCalculator.examples.minimum.title',
      },
      {
        description: 'translated:successFeeCalculator.examples.legalActionCap.description',
        id: 'legal-action-cap',
        legalActionCap: true,
        planKey: 'standard',
        recoveryAmount: 4000,
        title: 'translated:successFeeCalculator.examples.legalActionCap.title',
      },
    ]);
  });
});
