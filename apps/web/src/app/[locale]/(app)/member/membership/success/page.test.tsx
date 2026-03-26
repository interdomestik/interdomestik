import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      name: 'Test Member',
      tenantId: 'tenant-ks',
    },
  })),
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
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
  default: ({ children, href = '#' }: { children: ReactNode; href?: string }) => (
    <a href={href}>{children}</a>
  ),
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

    expect(hoisted.getSessionSafeMock).toHaveBeenCalledWith('MemberMembershipSuccessPage');
    expect(screen.getByText('membership.success.hotline_disclaimer.title')).toBeInTheDocument();
    expect(screen.getByText('membership.success.hotline_disclaimer.body')).toBeInTheDocument();
  });

  it('redirects to the localized login page when the success page opens without a session', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce(null as never);
    hoisted.redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      MembershipSuccessPage({
        params: Promise.resolve({ locale: 'mk' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('redirect:/mk/login');

    expect(hoisted.redirectMock).toHaveBeenCalledWith('/mk/login');
  });
});
