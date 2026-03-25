import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
  })),
  setRequestLocaleMock: vi.fn(),
  headersMock: vi.fn(async () => new Headers()),
  notFoundMock: vi.fn(),
  interMock: vi.fn(() => ({ variable: 'font-inter' })),
  spaceGroteskMock: vi.fn(() => ({ variable: 'font-space-grotesk' })),
}));

vi.mock('@interdomestik/ui/globals.css', () => ({}));

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
  notFound: hoisted.notFoundMock,
}));

vi.mock('next/font/google', () => ({
  Inter: hoisted.interMock,
  Space_Grotesk: hoisted.spaceGroteskMock,
}));

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['sq', 'en', 'sr', 'mk'],
  },
}));

vi.mock('@/i18n/messages', () => ({
  BASE_NAMESPACES: ['common'],
  pickMessages: (messages: Record<string, unknown>) => messages,
}));

vi.mock('@/components/accessibility/axe-provider', () => ({
  AxeProvider: () => null,
}));

vi.mock('@/components/analytics/analytics-scripts', () => ({
  AnalyticsScripts: () => null,
}));

vi.mock('@/components/pwa-registrar', () => ({
  PwaRegistrar: () => null,
}));

vi.mock('@/components/analytics/referral-tracker', () => ({
  ReferralTracker: () => null,
}));

vi.mock('@/components/privacy/cookie-consent-banner', () => ({
  CookieConsentBanner: () => null,
}));

vi.mock('@/components/providers/posthog-provider', () => ({
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/providers/query-provider', () => ({
  QueryProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
}));

import RootLayout from './_core.entry';

describe('RootLayout font wiring', () => {
  it('attaches next/font variables to the body class list', async () => {
    const tree = await RootLayout({
      children: null,
      params: Promise.resolve({ locale: 'en' }),
    });

    const body = tree.props.children;

    expect(hoisted.interMock).toHaveBeenCalled();
    expect(hoisted.spaceGroteskMock).toHaveBeenCalled();
    expect(body.props.className).toContain('font-inter');
    expect(body.props.className).toContain('font-space-grotesk');
    expect(body.props.className).toContain('antialiased');
    expect(hoisted.headersMock).not.toHaveBeenCalled();
  });

  it('does not inject the devtools script by default', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    try {
      const tree = await RootLayout({
        children: null,
        params: Promise.resolve({ locale: 'en' }),
      });

      const body = tree.props.children;
      const bodyChildren = Array.isArray(body.props.children)
        ? body.props.children
        : [body.props.children];

      expect(
        bodyChildren.some(
          (child: { type?: unknown } | null | undefined) => child?.type === 'script'
        )
      ).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('hides the Next devtools badge in development by default', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    try {
      const tree = await RootLayout({
        children: null,
        params: Promise.resolve({ locale: 'en' }),
      });

      const body = tree.props.children;
      const bodyChildren = Array.isArray(body.props.children)
        ? body.props.children
        : [body.props.children];

      expect(
        bodyChildren.some(
          (child: { type?: unknown; props?: { children?: string } } | null | undefined) =>
            child?.type === 'style' &&
            typeof child?.props?.children === 'string' &&
            child.props.children.includes('Open Next.js Dev Tools')
        )
      ).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
