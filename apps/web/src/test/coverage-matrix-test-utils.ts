import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';

type TranslationOptions = { namespace?: string } | string | undefined;

export function getNamespacedTranslation(options?: TranslationOptions) {
  if (typeof options === 'string') {
    return (key: string) => `${options}.${key}`;
  }

  if (options?.namespace) {
    return (key: string) => `${options.namespace}.${key}`;
  }

  return (key: string) => key;
}

type CoverageMatrixAssertion = Readonly<{
  columnKey: string;
  rowKey: string;
  sectionTestId: string;
}>;

export function expectCoverageMatrix({
  columnKey,
  rowKey,
  sectionTestId,
}: CoverageMatrixAssertion) {
  const coverageMatrix = screen.getByTestId(sectionTestId);

  expect(within(coverageMatrix).getByText('coverageMatrix.title')).toBeInTheDocument();
  expect(within(coverageMatrix).getAllByText(rowKey)).toHaveLength(2);
  expect(within(coverageMatrix).getAllByText(columnKey)).toHaveLength(6);

  return coverageMatrix;
}
