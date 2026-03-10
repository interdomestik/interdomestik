import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';

type CommercialTermsAssertion = Readonly<{
  sectionTestId: string;
}>;

export function expectCommercialTerms({ sectionTestId }: CommercialTermsAssertion) {
  const billingTerms = screen.getByTestId(sectionTestId);

  expect(within(billingTerms).getByText('commercialTerms.title')).toBeInTheDocument();
  expect(
    within(billingTerms).getByText('commercialTerms.sections.annualBilling.title')
  ).toBeInTheDocument();
  expect(
    within(billingTerms).getByText('commercialTerms.sections.cancellation.title')
  ).toBeInTheDocument();
  expect(
    within(billingTerms).getByText('commercialTerms.sections.refundWindow.title')
  ).toBeInTheDocument();
  expect(
    within(billingTerms).getByText('commercialTerms.sections.coolingOff.title')
  ).toBeInTheDocument();
  expect(
    within(billingTerms).getByText('commercialTerms.sections.acceptedMatters.title')
  ).toBeInTheDocument();

  return billingTerms;
}
