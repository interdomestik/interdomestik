import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      tenantId: 'tenant-ks',
    },
  })),
  getMembershipPageModelCoreMock: vi.fn(async () => ({
    subscription: null,
    dunning: {
      isPastDue: false,
      isInGracePeriod: false,
      isGraceExpired: false,
      daysRemaining: 0,
    },
  })),
  redirectMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={`/en${href}`}>{children}</a>
  ),
}));

vi.mock('@/app/[locale]/(app)/member/membership/_core', () => ({
  getMembershipPageModelCore: hoisted.getMembershipPageModelCoreMock,
}));

vi.mock('@/app/[locale]/(app)/member/membership/components/grace-period-banner', () => ({
  GracePeriodBanner: () => null,
}));

vi.mock('@/app/[locale]/(app)/member/membership/components/locked-state-banner', () => ({
  LockedStateBanner: () => null,
}));

vi.mock('@/app/[locale]/(app)/member/membership/components/manage-subscription-button', () => ({
  ManageSubscriptionButton: () => null,
}));

import { MembershipV2Page } from './MembershipV2Page';

describe('MembershipV2Page', () => {
  it('routes members without a subscription to the localized pricing page', async () => {
    const tree = await MembershipV2Page({ locale: 'en' });

    render(tree);

    expect(hoisted.getMembershipPageModelCoreMock).toHaveBeenCalledWith({
      userId: 'member-1',
      tenantId: 'tenant-ks',
    });
    expect(screen.getByRole('link', { name: 'plan.view_plans_button' })).toHaveAttribute(
      'href',
      '/en/pricing'
    );
  });
});
