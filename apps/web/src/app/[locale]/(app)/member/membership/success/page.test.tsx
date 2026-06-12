import { render, screen } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

type MockSession = {
  user: { id: string; name: string; tenantId: string; tenantClassificationPending?: boolean };
} | null;
type MockSubscription = { id: string; status: string; planId: string } | null;

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn<() => Promise<MockSession>>(async () => ({
    user: { id: 'member-1', name: 'Test Member', tenantId: 'tenant-ks' },
  })),
  getActiveSubscriptionMock: vi.fn<() => Promise<MockSubscription>>(async () => ({
    id: 'sub-1',
    status: 'active',
    planId: 'standard',
  })),
  isBillingTestActivationEnabledMock: vi.fn(() => false),
  mockActivationTriggerMock: vi.fn((_props: { planId: string; priceId: string }) => null),
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

vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  getActiveSubscription: hoisted.getActiveSubscriptionMock,
}));

vi.mock('./success-entity-disclosure', () => ({
  SuccessEntityDisclosure: () => (
    <div data-testid="membership-success-entity-disclosure">entity disclosure</div>
  ),
}));

vi.mock('@/lib/flags', () => ({
  isUiV2Enabled: () => false,
}));

vi.mock('@/lib/runtime-environment', () => ({
  isBillingTestActivationEnabled: hoisted.isBillingTestActivationEnabledMock,
}));

vi.mock('@/components/analytics/funnel-trackers', () => ({
  FunnelActivationTracker: () => null,
}));

vi.mock('@/components/billing/mock-activation-trigger', () => ({
  MockActivationTrigger: hoisted.mockActivationTriggerMock,
}));

vi.mock('@/components/pwa/install-button', () => ({
  PwaInstallButton: ({ label }: { label: string }) => <button>{label}</button>,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href = '#',
    className,
  }: {
    children: ReactNode;
    href?: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@interdomestik/ui', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    className,
    asChild,
  }: {
    children: ReactNode;
    className?: string;
    asChild?: boolean;
  }) => {
    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<{ className?: string }>;
      return cloneElement(child, {
        className: [child.props.className, className].filter(Boolean).join(' '),
      });
    }

    return <button className={className}>{children}</button>;
  },
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import MembershipSuccessPage from './page';
import { resolveSuccessTopNoteKey } from './_core.entry';

describe('MembershipSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.isBillingTestActivationEnabledMock.mockReturnValue(false);
  });

  it('resolves the top-note translation key from membership state', () => {
    expect(
      resolveSuccessTopNoteKey({
        membershipActive: true,
        tenantClassificationPending: true,
      })
    ).toBe('classification_note');
    expect(
      resolveSuccessTopNoteKey({
        membershipActive: true,
        tenantClassificationPending: false,
      })
    ).toBe('active_note');
    expect(
      resolveSuccessTopNoteKey({
        membershipActive: false,
        tenantClassificationPending: false,
      })
    ).toBe('pending_note');
  });

  it('renders hotline routing-only clarification on the post-checkout success surface', async () => {
    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(hoisted.getSessionSafeMock).toHaveBeenCalledWith('MemberMembershipSuccessPage');
    expect(screen.getByText('membership.success.hotline_disclaimer.title')).toBeInTheDocument();
    expect(screen.getByText('membership.success.hotline_disclaimer.body')).toBeInTheDocument();
    expect(screen.getByText('membership.success.active_note')).toBeInTheDocument();
    expect(screen.getByText('membership.success.onboarding_note')).toBeInTheDocument();
    expect(screen.getByText('membership.success.cta_open_dashboard')).toBeInTheDocument();
    expect(screen.getByText('membership.success.cta_start_claim')).toBeInTheDocument();
    expect(screen.getByText('membership.success.cta_helper')).toBeInTheDocument();
    expect(screen.getByText('membership.success.status_active')).toBeInTheDocument();
    expect(screen.getByTestId('membership-success-entity-disclosure')).toBeInTheDocument();
  });

  it('shows an activation-in-progress state when no active subscription exists yet', async () => {
    hoisted.getActiveSubscriptionMock.mockResolvedValueOnce(null);

    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByText('membership.success.pending_subtitle')).toBeInTheDocument();
    expect(screen.getByText('membership.success.activation_pending_title')).toBeInTheDocument();
    expect(screen.getByText('membership.success.activation_pending_body')).toBeInTheDocument();
    expect(screen.getByText('membership.success.cta_open_dashboard')).toBeInTheDocument();
    expect(screen.getByText('membership.success.cta_refresh_status')).toBeInTheDocument();
    expect(screen.getByText('membership.success.status_pending')).toBeInTheDocument();
    expect(screen.getByTestId('membership-success-entity-disclosure')).toBeInTheDocument();
    expect(screen.queryByText('membership.success.cta_start_claim')).not.toBeInTheDocument();
  });

  it('uses real active membership truth even if the URL still says activation is pending', async () => {
    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ activation: 'pending' }),
    });

    render(tree);

    expect(
      screen.queryByText('membership.success.activation_pending_title')
    ).not.toBeInTheDocument();
    expect(screen.getByText('membership.success.status_active')).toBeInTheDocument();
    expect(screen.getByText('membership.success.cta_start_claim')).toBeInTheDocument();
    expect(screen.queryByText('membership.success.cta_refresh_status')).not.toBeInTheDocument();
  });

  it('keeps the tenant-classification note for active members that are still pending classification', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        id: 'member-1',
        name: 'Test Member',
        tenantId: 'tenant-ks',
        tenantClassificationPending: true,
      },
    });

    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByText('membership.success.classification_note')).toBeInTheDocument();
    expect(screen.queryByText('membership.success.active_note')).not.toBeInTheDocument();
  });

  it('redirects to the localized login page when the success page opens without a session', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce(null);
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

  it('keeps the primary mobile actions at accessible touch-target size', async () => {
    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    const openDashboard = screen.getByRole('link', {
      name: 'membership.success.cta_open_dashboard',
    });
    const startClaim = screen.getByRole('link', {
      name: 'membership.success.cta_start_claim',
    });

    expect(openDashboard.className).toContain('min-h-[44px]');
    expect(startClaim.className).toContain('min-h-[44px]');
  });

  it('hides the start-claim CTA while activation is still pending', async () => {
    hoisted.getActiveSubscriptionMock.mockResolvedValueOnce(null);

    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ activation: 'pending' }),
    });

    render(tree);

    expect(
      screen.queryByRole('link', { name: 'membership.success.cta_start_claim' })
    ).not.toBeInTheDocument();
  });

  it('does not mount billing test activation from URL params when the runtime guard is disabled', async () => {
    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        test: 'true',
        planId: 'standard',
        priceId: 'price-standard',
      }),
    });

    render(tree);

    expect(hoisted.isBillingTestActivationEnabledMock).toHaveBeenCalled();
    expect(hoisted.mockActivationTriggerMock).not.toHaveBeenCalled();
  });

  it('mounts billing test activation only when test params and the runtime guard allow it', async () => {
    hoisted.isBillingTestActivationEnabledMock.mockReturnValueOnce(true);

    const tree = await MembershipSuccessPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        test: 'true',
        planId: 'standard',
        priceId: 'price-standard',
      }),
    });

    render(tree);

    expect(hoisted.mockActivationTriggerMock).toHaveBeenCalledTimes(1);
    expect(hoisted.mockActivationTriggerMock.mock.calls[0]?.[0]).toMatchObject({
      planId: 'standard',
      priceId: 'price-standard',
    });
  });
});
