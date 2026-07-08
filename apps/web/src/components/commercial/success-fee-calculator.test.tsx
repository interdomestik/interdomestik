import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SuccessFeeCalculator } from './success-fee-calculator';
import {
  buildSuccessFeeCalculatorTestProps,
  getSuccessFeeCalculatorMessage,
} from '@/test/success-fee-calculator-test-utils';
import { buildSuccessFeeCalculatorProps } from './success-fee-calculator-props';
import { trackFeeSheetViewed } from './fee-math-sheet-instrumentation';
import { trackEvent } from '@/lib/analytics';

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

const props = buildSuccessFeeCalculatorTestProps();

describe('SuccessFeeCalculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(screen.getByTestId('success-fee-net-amount')).toHaveTextContent('EUR 75');
    expect(screen.getByTestId('success-fee-minimum-applies')).toHaveTextContent('Yes');
  });

  it('renders grouped euro amounts deterministically for Albanian locale examples', () => {
    const sqProps = buildSuccessFeeCalculatorProps(
      getSuccessFeeCalculatorMessage,
      'test-success-fee-calculator',
      'sq',
      {
        entityDisclosure: null,
        entityDisclosureLabels: props.entityDisclosureLabels,
      }
    );

    render(<SuccessFeeCalculator {...sqProps} />);

    expect(screen.getByText('15% x EUR 1.000 = EUR 150')).toBeInTheDocument();
  });

  it('renders the authorized court-path cost treatment copy keys', () => {
    render(<SuccessFeeCalculator {...props} />);

    const disclosure = screen.getByTestId('fee-math-sheet-court-costs');
    expect(
      within(disclosure).getByText('Court costs are agreed in writing before the court path starts')
    ).toBeInTheDocument();
    expect(within(disclosure).getByText('No success fee on no recovery')).toBeInTheDocument();
    expect(disclosure.querySelector('[data-copy-key="fees.lossPromise"]')).toBeInTheDocument();
    expect(disclosure.querySelector('[data-copy-key="fees.courtPathCosts"]')).toBeInTheDocument();
    expect(disclosure.querySelector('[data-copy-key="fees.thirdPartyCosts"]')).toBeInTheDocument();
    expect(disclosure.querySelector('[data-copy-key="fees.reimbursement"]')).toBeInTheDocument();
    expect(screen.queryByText('recover nothing, pay nothing')).not.toBeInTheDocument();
  });

  it('renders entity and governing-law disclosure from existing lineage', () => {
    render(<SuccessFeeCalculator {...props} />);

    const disclosure = screen.getByTestId('fee-math-sheet-entity-disclosure');
    expect(within(disclosure).getByText('Contracting entity')).toBeInTheDocument();
    expect(within(disclosure).getByText('Interdomestik KS LLC')).toBeInTheDocument();
    expect(within(disclosure).getByText('XK')).toBeInTheDocument();
  });

  it('keeps the public/offline display usable without protected entity data', () => {
    render(<SuccessFeeCalculator {...props} entityDisclosure={null} />);

    const disclosure = screen.getByTestId('fee-math-sheet-entity-disclosure');
    expect(within(disclosure).getByText('Contracting entity unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('fee-math-sheet-court-costs')).toBeInTheDocument();
  });

  it('tracks fee_sheet_viewed with only approved no-PII fields', () => {
    render(<SuccessFeeCalculator {...props} sectionTestId="pricing-success-fee-calculator" />);

    expect(trackEvent).toHaveBeenCalledWith('fee_sheet_viewed', {
      context: 'recovery_agreement',
      locale: 'en',
      source_surface: 'pricing-success-fee-calculator',
      third_party_cost_mode: 'written_agreement_required',
      offline_available: true,
    });
    const properties = vi.mocked(trackEvent).mock.calls[0]?.[1] ?? {};
    expect(Object.keys(properties)).toEqual([
      'context',
      'locale',
      'source_surface',
      'third_party_cost_mode',
      'offline_available',
    ]);
  });

  it('strips unapproved fee_sheet_viewed analytics properties', () => {
    trackFeeSheetViewed({
      context: 'recovery_agreement',
      locale: 'en',
      source_surface: 'unit-test',
      third_party_cost_mode: 'written_agreement_required',
      offline_available: true,
      claim_id: 'blocked',
    } as never);

    expect(trackEvent).toHaveBeenCalledWith('fee_sheet_viewed', {
      context: 'recovery_agreement',
      locale: 'en',
      source_surface: 'unit-test',
      third_party_cost_mode: 'written_agreement_required',
      offline_available: true,
    });
  });

  it('returns null when no plans are provided', () => {
    const { container } = render(<SuccessFeeCalculator {...props} planOptions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
