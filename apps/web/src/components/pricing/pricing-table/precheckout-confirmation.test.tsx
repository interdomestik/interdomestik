import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children, onClick, ...props }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { PrecheckoutConfirmation } from './precheckout-confirmation';

const plan = {
  id: 'standard',
  priceId: 'price-standard',
  name: 'Asistenca',
  price: 'EUR 20',
  period: '/year',
  description: 'Membership',
  features: [] as string[],
  popular: false,
  icon: (() => null) as never,
  color: 'indigo',
} as const;

describe('PrecheckoutConfirmation', () => {
  it('renders entity disclosure before checkout continuation', () => {
    const onContinue = vi.fn();

    render(
      <PrecheckoutConfirmation
        plan={plan}
        entityDisclosure={{
          contractingCompany: 'Interdomestik KS LLC',
          governingLaw: 'XK',
          unavailable: false,
        }}
        loading={false}
        t={(key: string) => key}
        onContinue={onContinue}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('pricing-entity-disclosure')).toHaveTextContent(
      'Interdomestik KS LLC'
    );
    expect(screen.getByText('XK')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));
    expect(onContinue).toHaveBeenCalled();
  });
});
