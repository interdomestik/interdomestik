import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SuccessFeeCalculator } from './success-fee-calculator';
import {
  buildSuccessFeeCalculatorTestProps,
  getSuccessFeeCalculatorMessage,
} from '@/test/success-fee-calculator-test-utils';
import { buildSuccessFeeCalculatorProps } from './success-fee-calculator-content';

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

  it('renders grouped euro amounts deterministically for Albanian locale examples', () => {
    const sqProps = buildSuccessFeeCalculatorProps(
      getSuccessFeeCalculatorMessage,
      'test-success-fee-calculator',
      'sq'
    );

    render(<SuccessFeeCalculator {...sqProps} />);

    expect(screen.getByText('15% x EUR 1.000 = EUR 150')).toBeInTheDocument();
  });

  it('returns null when no plans are provided', () => {
    const { container } = render(<SuccessFeeCalculator {...props} planOptions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
