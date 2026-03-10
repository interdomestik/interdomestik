import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { PricingSection } from './pricing-section';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@interdomestik/ui', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

describe('PricingSection', () => {
  it('wires each plan CTA to register with plan continuity query', () => {
    render(<PricingSection />);

    const ctas = screen.getAllByText('pricing.cta');
    const hrefs = ctas.map(cta => cta.closest('a')?.getAttribute('href'));

    expect(hrefs).toContain('/register?plan=standard');
    expect(hrefs).toContain('/register?plan=family');
    expect(hrefs).toContain('/register?plan=business');
    expect(screen.queryByText('pricing.monthly')).toBeNull();
    expect(screen.queryByText('pricing.yearly')).toBeNull();
    expectCommercialTerms({ sectionTestId: 'home-pricing-billing-terms' });
  });
});
