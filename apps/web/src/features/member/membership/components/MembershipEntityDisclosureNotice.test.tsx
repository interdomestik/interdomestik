import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

import { MembershipEntityDisclosureNotice } from './MembershipEntityDisclosureNotice';

describe('MembershipEntityDisclosureNotice', () => {
  it('renders contracting company and governing law', () => {
    render(
      <MembershipEntityDisclosureNotice
        testId="membership-entity-disclosure"
        disclosure={{
          contractingCompany: 'Interdomestik KS LLC',
          governingLaw: 'XK',
          unavailable: false,
        }}
      />
    );

    const disclosure = screen.getByTestId('membership-entity-disclosure');
    expect(disclosure).toHaveTextContent('Interdomestik KS LLC');
    expect(disclosure).toHaveTextContent('XK');
  });
});
