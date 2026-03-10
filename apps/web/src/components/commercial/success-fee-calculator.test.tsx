import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SuccessFeeCalculator } from './success-fee-calculator';
import { buildSuccessFeeCalculatorTestProps } from '@/test/success-fee-calculator-test-utils';

const props = buildSuccessFeeCalculatorTestProps();

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

  it('returns null when no plans are provided', () => {
    const { container } = render(<SuccessFeeCalculator {...props} planOptions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
