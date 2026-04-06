import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./_core.entry', () => ({
  __esModule: true,
  default: () => (
    <main data-testid="business-membership-page-ready">
      <h1>pricing.businessLead.title</h1>
      <a href="tel:+38349900600">pricing.businessLead.callCta</a>
      <a href="https://wa.me/38349900600">pricing.businessLead.whatsappCta</a>
    </main>
  ),
  generateMetadata: vi.fn(),
  generateViewport: vi.fn(),
}));

import BusinessMembershipPage from './page';

describe('Business membership page', () => {
  it('renders the assisted business membership entry surface', () => {
    render(<BusinessMembershipPage params={Promise.resolve({ locale: 'sq' })} />);

    expect(screen.getByTestId('business-membership-page-ready')).toBeInTheDocument();
    expect(screen.getByText('pricing.businessLead.title')).toBeInTheDocument();
  });
});
