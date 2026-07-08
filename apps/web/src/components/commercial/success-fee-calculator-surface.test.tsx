import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getSuccessFeeCalculatorMessage } from '@/test/success-fee-calculator-test-utils';
import { SuccessFeeCalculatorSurface } from './success-fee-calculator-surface';

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

describe('SuccessFeeCalculatorSurface', () => {
  it('renders localized static entity disclosure labels for Macedonian public fallback', () => {
    render(
      <SuccessFeeCalculatorSurface
        entity={null}
        locale="mk"
        surface="pricing"
        t={getSuccessFeeCalculatorMessage}
      />
    );

    const disclosure = screen.getByTestId('fee-math-sheet-entity-disclosure');
    expect(within(disclosure).getByText('Договорниот субјект не е достапен')).toBeInTheDocument();
  });

  it('renders localized static entity disclosure labels for Serbian public fallback', () => {
    render(
      <SuccessFeeCalculatorSurface
        entity={null}
        locale="sr"
        surface="pricing"
        t={getSuccessFeeCalculatorMessage}
      />
    );

    const disclosure = screen.getByTestId('fee-math-sheet-entity-disclosure');
    expect(within(disclosure).getByText('Ugovorni subjekat nije dostupan')).toBeInTheDocument();
  });
});
