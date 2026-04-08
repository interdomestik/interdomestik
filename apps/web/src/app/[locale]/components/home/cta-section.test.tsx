import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import enHeroMessages from '@/messages/en/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { CTASection } from './cta-section';

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

vi.mock('@/lib/contact', () => ({
  contactInfo: {
    phone: '+383 49 900 600',
    whatsapp: 'https://wa.me/38349900600',
  },
}));

describe('CTASection', () => {
  it('routes the public membership CTA into pricing', () => {
    render(<CTASection />);

    expect(screen.getByRole('link', { name: enHeroMessages.hero.cta })).toHaveAttribute(
      'href',
      '/pricing'
    );
  });
});
