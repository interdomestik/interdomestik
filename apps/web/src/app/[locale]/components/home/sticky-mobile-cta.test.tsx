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
  it('routes both sticky primary CTAs to Free Start with mobile safe-area padding once visible', () => {
    render(<StickyPrimeCTA />);
    const globalWindow = globalThis as Window & typeof globalThis;

    Object.defineProperty(globalWindow, 'scrollY', {
      configurable: true,
      value: 700,
    });
    fireEvent.scroll(globalWindow);

    const links = screen.getAllByRole('link', { name: enHeroMessages.hero.callNow });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '#free-start-intake');
    expect(links[1]).toHaveAttribute('href', '#free-start-intake');
    expect(links[0].closest('.fixed')).toHaveClass(
      'pb-[calc(0.75rem+env(safe-area-inset-bottom))]'
    );
  });
});
