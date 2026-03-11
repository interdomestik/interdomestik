import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import enTrustMessages from '@/messages/en/trust.json';
import sqTrustMessages from '@/messages/sq/trust.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const hoisted = vi.hoisted(() => ({
  currentLocale: 'en' as 'en' | 'sq',
}));

const localeMessages = {
  en: {
    trust: enTrustMessages.trust,
  },
  sq: {
    trust: sqTrustMessages.trust,
  },
} as const;

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => localeMessages[hoisted.currentLocale]),
}));

vi.mock('@/lib/flags', () => ({
  flags: {
    responseSla: true,
  },
}));

import { TrustStrip } from './trust-strip';

function renderTrustStrip(locale: 'en' | 'sq') {
  hoisted.currentLocale = locale;
  return render(<TrustStrip />);
}

describe('TrustStrip', () => {
  it.each([
    {
      locale: 'en' as const,
      messages: enTrustMessages.trust,
    },
    {
      locale: 'sq' as const,
      messages: sqTrustMessages.trust,
    },
  ])('renders trust stats and cue chips from the $locale locale bundle', ({ locale, messages }) => {
    renderTrustStrip(locale);

    expect(screen.getByText(messages.activeMembersValue)).toBeInTheDocument();
    expect(screen.getByText(messages.memberSavingsValue)).toBeInTheDocument();
    expect(screen.getByText(messages.successRateValue)).toBeInTheDocument();
    expect(screen.getByText(messages.hotlineResponseValue)).toBeInTheDocument();
    expect(screen.getByText(messages.trustCuesLabel)).toBeInTheDocument();
    expect(screen.getAllByTestId('trust-strip-cue-chip')).toHaveLength(messages.trustCues.length);
    expect(screen.getByText(messages.trustCues[0])).toBeInTheDocument();
    expect(screen.getByText(messages.trustCues[2])).toBeInTheDocument();
  });
});
