import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';

type SuccessFeeCalculatorAssertion = Readonly<{
  sectionTestId: string;
}>;

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
