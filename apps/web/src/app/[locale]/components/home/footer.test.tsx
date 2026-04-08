import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import enCommonMessages from '@/messages/en/common.json';
import enFooterMessages from '@/messages/en/footer.json';
import sqCommonMessages from '@/messages/sq/common.json';
import sqFooterMessages from '@/messages/sq/footer.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const hoisted = vi.hoisted(() => ({
  currentLocale: 'en' as 'en' | 'sq',
}));

const localeMessages = {
  en: {
    common: enCommonMessages.common,
    footer: enFooterMessages.footer,
  },
  sq: {
    common: sqCommonMessages.common,
    footer: sqFooterMessages.footer,
  },
} as const;

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => localeMessages[hoisted.currentLocale]),
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
    address: 'Prishtina, Kosovo',
    hours: 'Mon-Fri, 09:00-17:00',
  },
}));

import { Footer } from './footer';

function renderFooter(locale: 'en' | 'sq') {
  hoisted.currentLocale = locale;
  return render(<Footer />);
}

describe('Footer', () => {
  it.each([
    {
      locale: 'en' as const,
      messages: enFooterMessages.footer,
    },
    {
      locale: 'sq' as const,
      messages: sqFooterMessages.footer,
    },
  ])(
    'renders the claim-first safety net with urgent contact CTAs and trust cues from the $locale locale bundle',
    ({ locale, messages }) => {
      renderFooter(locale);

      expect(screen.getByTestId('footer-safety-net')).toBeInTheDocument();
      expect(screen.getByText(messages.safetyNet.title)).toBeInTheDocument();
      expect(screen.getByText(messages.safetyNet.body)).toBeInTheDocument();
      expect(screen.getByText(messages.hotlineLabel)).toBeInTheDocument();
      expect(screen.getByTestId('footer-safety-net-call')).toHaveAttribute(
        'href',
        'tel:+38349900600'
      );
      expect(screen.getByTestId('footer-safety-net-whatsapp')).toHaveAttribute(
        'href',
        'https://wa.me/38349900600'
      );
      expect(screen.getAllByTestId('footer-safety-net-chip')).toHaveLength(
        messages.safetyNet.chips.length
      );
      expect(screen.getByText(messages.safetyNet.chips[0])).toBeInTheDocument();
      expect(screen.getByText(messages.safetyNet.chips[2])).toBeInTheDocument();
      expect(screen.getByRole('link', { name: messages.joinClub })).toHaveAttribute(
        'href',
        '/pricing'
      );
    }
  );
});
