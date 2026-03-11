import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import enCommonMessages from '@/messages/en/common.json';
import enHeroMessages from '@/messages/en/hero.json';
import sqCommonMessages from '@/messages/sq/common.json';
import sqHeroMessages from '@/messages/sq/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { HeroV2 } from './hero-v2';
import { getStartClaimHrefForSession } from '../../home-v2.core';

const localeMessages = {
  en: {
    common: enCommonMessages.common,
    hero: enHeroMessages.hero,
  },
  sq: {
    common: sqCommonMessages.common,
    hero: sqHeroMessages.hero,
  },
} as const;

const hoisted = vi.hoisted(() => ({
  currentLocale: 'en' as 'sq' | 'en',
}));

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => localeMessages[hoisted.currentLocale]),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode;
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

function renderHero(locale: 'sq' | 'en', startClaimHref: string) {
  hoisted.currentLocale = locale;
  return render(<HeroV2 locale={locale} startClaimHref={startClaimHref} />);
}

describe('HeroV2', () => {
  it('renders localized CTA when UI_V2 is enabled and user is signed out', () => {
    const href = getStartClaimHrefForSession({ locale: 'sq', session: null });

    renderHero('sq', href);

    const cta = screen.getByTestId('hero-v2-start-claim');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveTextContent('Nis raportimin');
    expect(cta).toHaveAttribute('href', '/register');
    expect(screen.getByTestId('hero-v2-invite-chip')).toHaveAttribute('href', '/register');
    expect(screen.getByTestId('hero-v2-digital-id-link')).toHaveAttribute('href', '/member');
  });

  it('routes Start a claim CTA to claim creation for signed-in members', () => {
    const href = getStartClaimHrefForSession({
      locale: 'sq',
      session: { userId: 'u-1', role: 'member' },
    });

    renderHero('sq', href);

    expect(screen.getByTestId('hero-v2-start-claim')).toHaveAttribute('href', '/member/claims/new');
  });

  it('shows proof chips and multilingual trust cues on the English claim-first hero', () => {
    const href = getStartClaimHrefForSession({ locale: 'en', session: null });

    renderHero('en', href);

    expect(screen.getAllByTestId('hero-v2-proof-chip')).toHaveLength(3);
    expect(screen.getByText('Shqip / English support')).toBeInTheDocument();
    expect(screen.getByTestId('hero-v2-help-call')).toHaveAttribute('href', 'tel:+38349900600');
    expect(screen.getByTestId('hero-v2-help-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
  });
});
