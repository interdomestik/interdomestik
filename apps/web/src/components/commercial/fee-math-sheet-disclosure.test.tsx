import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EN_FEE_MATH_SHEET_COPY } from './fee-math-sheet-copy-en';
import { FeeMathSheetDisclosure } from './fee-math-sheet-disclosure';
import { FEE_SHEET_VIEWED_CONTEXT } from './fee-math-sheet-instrumentation';
import { trackEvent } from '@/lib/analytics';

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

describe('FeeMathSheetDisclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the fee sheet as a named static accessibility region', () => {
    render(
      <FeeMathSheetDisclosure
        context={FEE_SHEET_VIEWED_CONTEXT}
        copy={EN_FEE_MATH_SHEET_COPY}
        locale="en"
        sourceSurface="unit-test"
      />
    );

    const disclosure = screen.getByRole('region', {
      name: 'Court costs are agreed in writing before the court path starts',
    });

    expect(disclosure).toHaveAccessibleDescription(
      'No recovery means no success fee to Interdomestik. External court-path costs are not promised as always zero; they are controlled by the written court-path agreement before the cost is created.'
    );
    expect(within(disclosure).getByText('Court path is disclosed first')).toBeInTheDocument();
    expect(within(disclosure).queryAllByRole('button')).toHaveLength(0);
    expect(within(disclosure).queryAllByRole('link')).toHaveLength(0);
  });

  it('tracks only the MOB-05a recovery agreement context with offline availability', () => {
    render(
      <FeeMathSheetDisclosure
        context={FEE_SHEET_VIEWED_CONTEXT}
        copy={EN_FEE_MATH_SHEET_COPY}
        locale="en"
        sourceSurface="unit-test"
      />
    );

    expect(FEE_SHEET_VIEWED_CONTEXT).toBe('recovery_agreement');
    expect(FEE_SHEET_VIEWED_CONTEXT).not.toBe('vonesa');
    expect(FEE_SHEET_VIEWED_CONTEXT).not.toBe('expert_cost');
    expect(trackEvent).toHaveBeenCalledWith('fee_sheet_viewed', {
      context: 'recovery_agreement',
      locale: 'en',
      source_surface: 'unit-test',
      third_party_cost_mode: 'written_agreement_required',
      offline_available: true,
    });
  });
});
