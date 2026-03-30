import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import sqHeroMessages from '@/messages/sq/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { HeroSection } from './hero-section';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    hero: sqHeroMessages.hero,
  })),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: () => ({
    phoneE164: '+38349900600',
    phoneDisplay: '+38349900600',
    telHref: 'tel:+38349900600',
    whatsappE164: '+38349900600',
    whatsappHref: 'https://wa.me/38349900600',
  }),
}));

describe('HeroSection', () => {
  it('keeps the old hero structure while prioritizing membership, 60-second intake, and WhatsApp', () => {
    render(
      <HeroSection
        locale="sq"
        primaryHref="/register"
        secondaryHref="#free-start-intake"
        tenantId="tenant_ks"
      />
    );

    expect(
      screen.getByRole('heading', { name: /Nuk jeni vetëm pas një aksidenti/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Anëtarësimi juaj vjetor zhbllokon udhëzime nga ekspertët dhe mbështetje prioritare për dëmet/i
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Fillo anëtarësimin/i })).toHaveAttribute(
      'href',
      '/register'
    );
    expect(screen.getByRole('link', { name: /Nise për 60 sekonda/i })).toHaveAttribute(
      'href',
      '#free-start-intake'
    );
    expect(screen.getByRole('link', { name: /Mbështetje në WhatsApp/i })).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
  });
});
