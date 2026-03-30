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
  it('renders membership-first public CTA when the landing page is in signed-out mode', () => {
    const href = '#free-start-intake';

    renderHero('sq', href);

    const cta = screen.getByTestId('hero-v2-start-claim');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveTextContent('Fillo anëtarësimin');
    expect(cta).toHaveAttribute('href', '#free-start-intake');
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

  it('shows membership trust cues on the English signed-out hero', () => {
    const href = '#free-start-intake';

    renderHero('en', href);

    expect(screen.getAllByTestId('hero-v2-proof-chip')).toHaveLength(3);
    expect(screen.getByText('Trusted by 8,500+ active members')).toBeInTheDocument();
    expect(
      screen.getAllByText('Annual membership with a 30-day launch refund window')
    ).toHaveLength(2);
    expect(screen.getAllByText('Your proof of membership, instantly available')).toHaveLength(2);
    expect(screen.getByTestId('hero-v2-help-call')).toHaveAttribute('href', 'tel:+38349900600');
    expect(screen.getByTestId('hero-v2-help-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
  });
});
