import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import enHeroMessages from '@/messages/en/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { StickyPrimeCTA } from './sticky-mobile-cta';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    hero: enHeroMessages.hero,
  })),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('StickyPrimeCTA', () => {
  it('routes both sticky membership CTAs into pricing once visible', () => {
    render(<StickyPrimeCTA />);

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 700,
    });
    fireEvent.scroll(window);

    const links = screen.getAllByRole('link', { name: enHeroMessages.hero.cta });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/pricing');
    expect(links[1]).toHaveAttribute('href', '/pricing');
  });
});
