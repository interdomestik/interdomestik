import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
    app: { title: 'App' },
  })),
  setRequestLocaleMock: vi.fn(),
  getSessionMock: vi.fn(async () => ({
    user: { id: 'u1' },
  })),
  headersMock: vi.fn(async () => new Headers()),
}));

vi.mock('next-intl/server', () => ({
  getMessages: hoisted.getMessagesMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/i18n/messages', () => ({
  BASE_NAMESPACES: ['common'],
  APP_NAMESPACES: ['app'],
  pickMessages: (messages: Record<string, unknown>) => messages,
}));

import AppProtectedLayout from './_core.entry';

describe('AppProtectedLayout i18n initialization', () => {
  it('sets request locale before loading messages', async () => {
    await AppProtectedLayout({
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
