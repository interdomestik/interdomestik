import enLegal from '@/messages/en/legal.json';
import sqLegal from '@/messages/sq/legal.json';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function getTranslationValue(source: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);

  return typeof value === 'string' ? value : key;
}

function getNamespaceValue(source: unknown, namespace?: string): unknown {
  if (!namespace) {
    return source;
  }

  return namespace.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (options?: { locale?: 'en' | 'sq'; namespace?: string } | string) => {
    const locale = typeof options === 'string' ? 'en' : (options?.locale ?? 'en');
    const namespace = typeof options === 'string' ? options : options?.namespace;
    const messages = locale === 'sq' ? sqLegal : enLegal;
    const scopedMessages = getNamespaceValue(messages, namespace);

    return (key: string) => getTranslationValue(scopedMessages, key);
  },
}));

import PrivacyPage from './_core.entry';

describe('PrivacyPage', () => {
  it('renders the privacy body from translation content instead of hardcoded copy', async () => {
    const tree = await PrivacyPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expect(screen.getByText(enLegal.legal.privacy.intro)).toBeInTheDocument();
    expect(screen.getByText(enLegal.legal.privacy.sections.handling.title)).toBeInTheDocument();
    expect(screen.getByText(enLegal.legal.privacy.sections.handling.body)).toBeInTheDocument();
    expect(screen.getByText(enLegal.legal.privacy.sections.rights.title)).toBeInTheDocument();
    expect(screen.getByText(enLegal.legal.privacy.sections.deletion.title)).toBeInTheDocument();
    expect(screen.getByText('POST /api/privacy/data-deletion')).toBeInTheDocument();
    expect(screen.getByText('{ "reason": "..." }')).toBeInTheDocument();
    expect(screen.getByText(enLegal.legal.privacy.sections.deletion.followup)).toBeInTheDocument();
  });

  it('renders localized privacy copy for the requested public locale', async () => {
    const tree = await PrivacyPage({
      params: Promise.resolve({ locale: 'sq' }),
    });

    render(tree);

    expect(screen.getByText(sqLegal.legal.privacy.title)).toBeInTheDocument();
    expect(screen.getByText(sqLegal.legal.privacy.intro)).toBeInTheDocument();
    expect(screen.getByText(sqLegal.legal.privacy.sections.rights.body)).toBeInTheDocument();
  });
});
