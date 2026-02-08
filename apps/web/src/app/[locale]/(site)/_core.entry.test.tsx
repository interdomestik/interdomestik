import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const hoisted = vi.hoisted(() => ({
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
    pricing: { title: 'Pricing' },
  })),
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getMessages: hoisted.getMessagesMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/i18n/messages', () => ({
  BASE_NAMESPACES: ['common'],
  SITE_NAMESPACES: ['pricing'],
  pickMessages: (messages: Record<string, unknown>) => messages,
}));

import SiteLayout from './_core.entry';

describe('SiteLayout i18n initialization', () => {
  it('sets request locale before loading messages', async () => {
    await SiteLayout({
      children: null,
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getMessagesMock).toHaveBeenCalledTimes(1);
    expect(hoisted.setRequestLocaleMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.getMessagesMock.mock.invocationCallOrder[0]
    );
  });
});
