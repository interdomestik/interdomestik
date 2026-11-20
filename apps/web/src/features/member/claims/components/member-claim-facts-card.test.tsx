import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => `t:${key}`,
}));

import { MemberClaimFactsCard } from './member-claim-facts-card';

describe('MemberClaimFactsCard', () => {
  it('hides the amount row when the claim has no amount', () => {
    render(
      <MemberClaimFactsCard
        claim={{ description: 'Lloji i rastit: X\nProblemi: Y', amount: null, currency: 'EUR' }}
      />
    );
    expect(screen.queryByText('t:table.amount')).not.toBeInTheDocument();
    expect(screen.queryByText('EUR')).not.toBeInTheDocument();
    expect(screen.getByText(/Lloji i rastit: X/)).toHaveClass('whitespace-pre-line');
  });

  it('shows a formatted amount when present', () => {
    render(
      <MemberClaimFactsCard claim={{ description: 'Përshkrim', amount: '1200', currency: 'EUR' }} />
    );
    expect(screen.getByText('t:table.amount')).toBeInTheDocument();
    expect(screen.getByText(/1\.200,00/)).toBeInTheDocument();
  });
});
