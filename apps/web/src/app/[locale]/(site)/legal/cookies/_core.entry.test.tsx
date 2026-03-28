import enLegal from '@/messages/en/legal.json';
import sqLegal from '@/messages/sq/legal.json';
import { getJsonNamespaceValue, getJsonTranslationValue } from '@/test/i18n-json-test-utils';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async (options?: { locale?: 'en' | 'sq'; namespace?: string } | string) => {
    const locale = typeof options === 'string' ? 'en' : (options?.locale ?? 'en');
    const namespace = typeof options === 'string' ? options : options?.namespace;
    const messages = locale === 'sq' ? sqLegal : enLegal;
    const scopedMessages = getJsonNamespaceValue(messages, namespace);

    return (key: string) => getJsonTranslationValue(scopedMessages, key);
  },
}));

import CookiesPage from './_core.entry';

describe('CookiesPage', () => {
  it('renders the cookie policy body from translation content', async () => {
    const tree = await CookiesPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expect(screen.getByText(enLegal.legal.cookies.intro)).toBeInTheDocument();
    expect(screen.getByText(enLegal.legal.cookies.preference)).toBeInTheDocument();
  });

  it('renders localized cookie copy for the requested public locale', async () => {
    const tree = await CookiesPage({
      params: Promise.resolve({ locale: 'sq' }),
    });

    render(tree);

    expect(screen.getByText(sqLegal.legal.cookies.title)).toBeInTheDocument();
    expect(screen.getByText(sqLegal.legal.cookies.intro)).toBeInTheDocument();
    expect(screen.getByText(sqLegal.legal.cookies.preference)).toBeInTheDocument();
  });
});
