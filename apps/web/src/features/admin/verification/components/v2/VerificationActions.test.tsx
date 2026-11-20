import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VerificationActions } from './VerificationActions';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `leads.${key}`,
}));

describe('VerificationActions', () => {
  it('gives every icon-only row action an explicit localized accessible name', () => {
    const onViewDetails = vi.fn();
    const onVerify = vi.fn();
    const onAction = vi.fn();
    render(
      <VerificationActions
        id="req-1"
        onViewDetails={onViewDetails}
        onVerify={onVerify}
        onAction={onAction}
      />
    );

    const expected = [
      ['verification-details-button', 'leads.details'],
      ['cash-approve', 'leads.approve'],
      ['cash-needs-info', 'leads.needs_info'],
      ['cash-reject', 'leads.reject'],
    ] as const;
    for (const [testId, name] of expected) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('data-testid', testId);
      expect(screen.getByTestId(testId)).toHaveAttribute('aria-label', name);
    }

    fireEvent.click(screen.getByRole('button', { name: 'leads.needs_info' }));
    expect(onAction).toHaveBeenCalledWith('req-1', 'needs_info');
  });
});
