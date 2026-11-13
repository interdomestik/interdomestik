import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import AdminNotFound from '../../not-found';
import BranchNotFound from './not-found';

vi.unmock('next-intl');
const catalogs = import.meta.glob('../../../../../messages/*/common.json', {
  eager: true,
  import: 'default',
});

type Messages = Parameters<typeof createTranslator>[0]['messages'];

describe('admin branch detail not-found boundary', () => {
  it('renders the shared localized admin not-found page inside the branch segment', () => {
    expect(BranchNotFound).toBe(AdminNotFound);
  });

  it.each(LOCALES)('renders the %s page copy from the route locale, not the default', locale => {
    const messages = catalogs[`../../../../../messages/${locale}/common.json`] as Messages;
    const t = createTranslator({ locale, messages, namespace: 'common.notFound' });
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale,
        messages,
        children: createElement(BranchNotFound),
      })
    );
    expect(html).toContain(t('title'));
    expect(html).toContain(t('description'));
    expect(html).toContain(`href="/${locale}"`);
  });
});
