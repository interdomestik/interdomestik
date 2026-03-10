import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      name: 'Test Member',
      tenantId: 'tenant-ks',
    },
  })),
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/lib/flags', () => ({
  isUiV2Enabled: () => false,
}));

vi.mock('@/components/analytics/funnel-trackers', () => ({
  FunnelActivationTracker: () => null,
}));

vi.mock('@/components/billing/mock-activation-trigger', () => ({
  MockActivationTrigger: () => null,
}));

vi.mock('@/components/pwa/install-button', () => ({
  PwaInstallButton: ({ label }: { label: string }) => <button>{label}</button>,
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock('@interdomestik/ui', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import MembershipSuccessPage from './page';

describe('MembershipSuccessPage hotline disclaimer', () => {
  it('renders hotline routing-only clarification on the post-checkout success surface', async () => {
    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByText('membership.success.hotline_disclaimer.title')).toBeInTheDocument();
    expect(screen.getByText('membership.success.hotline_disclaimer.body')).toBeInTheDocument();
  });
});
