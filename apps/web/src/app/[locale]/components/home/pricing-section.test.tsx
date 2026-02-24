import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingSection } from './pricing-section';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

describe('PricingSection', () => {
  it('wires each plan CTA to register with plan continuity query', () => {
    render(<PricingSection />);

    const ctas = screen.getAllByText('cta');
    const hrefs = ctas.map(cta => cta.closest('a')?.getAttribute('href'));

    expect(hrefs).toContain('/register?plan=standard');
    expect(hrefs).toContain('/register?plan=family');
    expect(hrefs).toContain('/register?plan=business');
  });
});
