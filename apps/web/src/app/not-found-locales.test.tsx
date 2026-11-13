import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import LocaleNotFound from './[locale]/not-found';

vi.unmock('next-intl');
const catalogs = import.meta.glob('../messages/*/common.json', { eager: true, import: 'default' });

type Messages = Parameters<typeof createTranslator>[0]['messages'];

function catalogFor(locale: string): Messages {
  return catalogs[`../messages/${locale}/common.json`] as Messages;
}

describe('localized not-found page', () => {
  it.each(LOCALES)('renders branded %s copy and a localized home link', locale => {
    const messages = catalogFor(locale);
    const t = createTranslator({ locale, messages, namespace: 'common.notFound' });
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LocaleNotFound />
      </NextIntlClientProvider>
    );
    expect(html).toContain('Interdomestik');
    expect(html).toContain(t('title'));
    expect(html).toContain(t('backHome'));
    expect(html).toContain(`href="/${locale}"`);
    expect(html).toContain('data-not-found-scope="locale-not-found"');
    expect(html).not.toMatch(/\(Locale\)|\(Root\)|Admin 404/);
  });

  it('never resolves the request locale on the server (qa3 #67)', () => {
    const source = readFileSync(path.resolve(__dirname, '[locale]/not-found.tsx'), 'utf8');
    expect(source.startsWith("'use client';")).toBe(true);
    expect(source).not.toContain('next-intl/server');
  });
});
