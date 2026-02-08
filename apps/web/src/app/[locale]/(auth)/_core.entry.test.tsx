import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const hoisted = vi.hoisted(() => ({
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
    auth: { login: { title: 'Welcome Back' } },
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
  AUTH_NAMESPACES: ['auth'],
  pickMessages: (messages: Record<string, unknown>) => messages,
}));

import AuthLayout from './_core.entry';

describe('AuthLayout i18n initialization', () => {
  it('sets request locale before loading messages', async () => {
    await AuthLayout({
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
