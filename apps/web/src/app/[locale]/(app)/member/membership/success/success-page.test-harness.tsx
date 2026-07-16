import { render } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { vi } from 'vitest';

import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

export type MockSession = {
  user: {
    id: string;
    name: string;
    tenantId: string | null;
    memberNumber?: string | null;
    tenantClassificationPending?: boolean;
  };
} | null;

export type MockSubscription = {
  id: string;
  status: string;
  planId: string;
  tenantId?: string;
  legalTenantId?: string | null;
  governingLawSnapshot?: string | null;
} | null;

export const activeSubscription: NonNullable<MockSubscription> = {
  id: 'sub-1',
  status: 'active',
  planId: 'standard',
  tenantId: 'tenant-ks',
  legalTenantId: 'legal-ks',
  governingLawSnapshot: 'XK',
};

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(),
  getActiveSubscriptionMock: vi.fn(),
  isBillingTestActivationEnabledMock: vi.fn(),
  mockActivationTriggerMock: vi.fn(),
  funnelActivationTrackerMock: vi.fn(),
  successEntityDisclosureMock: vi.fn(),
  redirectMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  routerRefreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
  useRouter: () => ({ replace: hoisted.routerReplaceMock, refresh: hoisted.routerRefreshMock }),
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
  SuccessEntityDisclosure: (props: unknown) => {
    hoisted.successEntityDisclosureMock(props);
    return <div data-testid="membership-success-entity-disclosure">entity disclosure</div>;
  },
}));
vi.mock('@/lib/flags', () => ({ isUiV2Enabled: () => false }));
vi.mock('@/lib/runtime-environment', () => ({
  isBillingTestActivationEnabled: hoisted.isBillingTestActivationEnabledMock,
}));
vi.mock('@/components/analytics/funnel-trackers', () => ({
  FunnelActivationTracker: (props: unknown) => {
    hoisted.funnelActivationTrackerMock(props);
    return null;
  },
}));
vi.mock('@/components/billing/mock-activation-trigger', () => ({
  MockActivationTrigger: (props: unknown) => {
    hoisted.mockActivationTriggerMock(props);
    return null;
  },
}));
vi.mock('@/components/pwa/install-button', () => ({
  PwaInstallButton: ({ label }: { label: string }) => <button>{label}</button>,
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock('@interdomestik/ui', () => ({
  Badge: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <span {...props}>{children}</span>
  ),
  Button: ({ children, asChild, ...props }: { children: ReactNode; asChild?: boolean }) => {
    if (asChild && isValidElement(children)) {
      return cloneElement(children as ReactElement<Record<string, unknown>>, props);
    }
    return <button {...props}>{children}</button>;
  },
  Card: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <h2 {...props}>{children}</h2>
  ),
}));

import MembershipSuccessPage from './page';

export function successMocks() {
  return hoisted;
}

export function resetSuccessHarness(): void {
  vi.clearAllMocks();
  hoisted.getSessionSafeMock.mockResolvedValue({
    user: { id: 'member-1', name: 'Test Member', tenantId: 'tenant-ks' },
  });
  hoisted.getActiveSubscriptionMock.mockResolvedValue(null);
  hoisted.isBillingTestActivationEnabledMock.mockReturnValue(false);
}

export async function renderSuccessPage(args: {
  locale?: string;
  searchParams?: Record<string, string | string[]>;
}) {
  const tree = await MembershipSuccessPage({
    params: Promise.resolve({ locale: args.locale ?? 'en' }),
    searchParams: Promise.resolve(args.searchParams ?? {}),
  });
  return render(tree);
}
