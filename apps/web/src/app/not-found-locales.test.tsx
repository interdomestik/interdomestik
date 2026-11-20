import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import LocaleNotFound from './[locale]/not-found';

vi.unmock('next-intl');
const state = vi.hoisted(() => ({ locale: 'sq', t: (key: string) => key }));
vi.mock('next-intl/server', () => ({
  getLocale: () => state.locale,
  getTranslations: () => state.t,
}));
const catalogs = import.meta.glob('../messages/*/common.json', { eager: true, import: 'default' });

describe('localized not-found page', () => {
  it.each(LOCALES)('renders branded %s copy and a localized home link', async locale => {
    state.locale = locale;
    const messages = catalogs[`../messages/${locale}/common.json`] as Parameters<
      typeof createTranslator
    >[0]['messages'];
    state.t = createTranslator({ locale, messages, namespace: 'common.notFound' });
    const html = renderToStaticMarkup(await LocaleNotFound());
    expect(html).toContain('Interdomestik');
    expect(html).toContain(state.t('title'));
    expect(html).toContain(state.t('backHome'));
    expect(html).toContain(`href="/${locale}"`);
    expect(html).toContain('data-not-found-scope="locale-not-found"');
    expect(html).not.toMatch(/\(Locale\)|\(Root\)|Admin 404/);
  });
});
