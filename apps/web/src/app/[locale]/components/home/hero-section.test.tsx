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
  it('keeps the hero structure while prioritizing the 60-second intake and WhatsApp', () => {
    render(<HeroSection locale="sq" tenantId="tenant_ks" />);

    expect(
      screen.getByRole('heading', { name: /Asistencë e organizuar për dëme/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Anëtarësimi juaj vjetor zhbllokon menaxhim hap-pas-hapi të rastit/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nise për 60 sekonda/i })).toHaveAttribute(
      'href',
      '#free-start-intake'
    );
    expect(screen.queryByRole('link', { name: /Fillo anëtarësimin/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mbështetje në WhatsApp/i })).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
  });
});
