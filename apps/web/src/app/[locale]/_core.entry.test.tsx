import { isValidElement, Suspense, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
  })),
  loadAllMessagesMock: vi.fn(async () => ({ common: { loading: 'Loading' } })),
  nonceMock: vi.fn(() => false),
  connectionMock: vi.fn(async () => {}),
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

vi.mock('@/lib/security/csp-nonce', () => ({ isCspNonceActive: hoisted.nonceMock }));
vi.mock('next/server', () => ({ connection: hoisted.connectionMock }));

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
  loadAllMessages: hoisted.loadAllMessagesMock,
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
import { RequestFallback } from '@/components/shell/request-boundary';

function findElementByType(node: ReactNode, type: unknown): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByType(child, type);
      if (match) return match;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === type) return node;
  return findElementByType(node.props.children, type);
}

describe('RootLayout font wiring', () => {
  beforeEach(() => {
    for (const mock of [
      hoisted.getMessagesMock,
      hoisted.loadAllMessagesMock,
      hoisted.headersMock,
      hoisted.connectionMock,
    ])
      mock.mockClear();
    hoisted.nonceMock.mockReturnValue(false);
  });

  it('uses bundled messages without request APIs in nonce-off mode', async () => {
    const tree = await RootLayout({ children: null, params: Promise.resolve({ locale: 'en' }) });
    expect(hoisted.loadAllMessagesMock).toHaveBeenCalledWith('en', { strict: expect.any(Boolean) });
    expect(hoisted.getMessagesMock).not.toHaveBeenCalled();
    expect(hoisted.connectionMock).not.toHaveBeenCalled();
    expect(hoisted.headersMock).not.toHaveBeenCalled();
    const boundary = findElementByType(tree, Suspense);
    expect(boundary).toHaveProperty('props.fallback.type', RequestFallback);
  });

  it('preserves request-dependent messages and nonce in report mode', async () => {
    hoisted.nonceMock.mockReturnValue(true);
    hoisted.headersMock.mockResolvedValueOnce(new Headers({ 'x-nonce': 'request-nonce' }));
    const tree = await RootLayout({ children: null, params: Promise.resolve({ locale: 'en' }) });
    expect(hoisted.getMessagesMock).toHaveBeenCalledOnce();
    expect(hoisted.loadAllMessagesMock).not.toHaveBeenCalled();
    expect(hoisted.connectionMock).toHaveBeenCalledOnce();
    const children = (tree.props.children.props.children as unknown[]).filter(
      isValidElement<{ nonce?: string; 'data-testid'?: string }>
    );
    expect(children.some(child => child.props.nonce === 'request-nonce')).toBe(true);
    expect(children.some(child => child.props['data-testid'] === 'page-ready')).toBe(true);
  });
  it('attaches next/font variables to the body class list', async () => {
    const tree = await RootLayout({
      children: null,
      params: Promise.resolve({ locale: 'en' }),
    });

    const body = tree.props.children;

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
