import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import { LocalizedToaster } from './localized-toaster';

vi.unmock('next-intl');
const catalogs = import.meta.glob('../messages/*/common.json', { eager: true, import: 'default' });

describe('toast accessibility', () => {
  it.each(LOCALES)('localizes the live region in %s without duplicating the hotkey', locale => {
    const messages = catalogs[`../messages/${locale}/common.json`] as {
      common: { toastRegion: string };
    };
    render(
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Europe/Skopje">
        <LocalizedToaster />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      `${messages.common.toastRegion} alt+T`
    );
  });
});
