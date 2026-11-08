import type { ReactNode } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';

export const originalConfirm = globalThis.confirm;

export const actionMocks = {
  cancelSubscription: vi.fn(),
  getPaymentUpdateUrl: vi.fn(),
  getMembershipActions: vi.fn(),
};

export const selectionMocks = {
  selectedId: null as string | null,
  setSelectedId: vi.fn(),
};

export const routerMocks = {
  push: vi.fn(),
};

export const localeMocks = {
  locale: 'en',
};

export const timelineMocks = {
  events: [] as Array<{ id: string; date: string }>,
};

vi.doMock('@/components/ops', () => ({
  OpsActionBar: ({
    primary,
    secondary,
  }: {
    primary?: { id: string; label: string; onClick: () => void; disabled?: boolean };
    secondary: Array<{ id: string; label: string; onClick: () => void; disabled?: boolean }>;
  }) => (
    <div>
      {primary ? (
        <button onClick={primary.onClick} disabled={primary.disabled}>
          {primary.label}
        </button>
      ) : null}
      {secondary.map(action => (
        <button key={action.id} onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </button>
      ))}
    </div>
  ),
  OpsDocumentsPanel: () => null,
  OpsStatusBadge: () => null,
  OpsTable: ({ emptyLabel }: { emptyLabel: string }) => <div>{emptyLabel}</div>,
  OpsTimeline: ({ formatTimestamp }: { formatTimestamp?: (value: string) => string }) => (
    <div data-testid="membership-timeline-date">
      {timelineMocks.events.map(event => formatTimestamp?.(event.date) ?? event.date).join(', ')}
    </div>
  ),
}));

vi.doMock('@/components/ops/adapters/membership', () => ({
  getMembershipActions: actionMocks.getMembershipActions,
  getSponsoredMembershipState: (subscription?: { provider?: string; sponsorCoverage?: unknown }) =>
    subscription?.sponsorCoverage
      ? 'covered'
      : subscription?.provider === 'group_sponsor'
        ? 'inactive'
        : 'none',
  toOpsDocuments: () => [],
  toOpsStatus: () => ({ label: 'active', variant: 'default' }),
  toOpsTimelineEvents: () => timelineMocks.events,
}));

vi.doMock('@/components/ops/useOpsSelectionParam', () => ({
  useOpsSelectionParam: () => ({
    selectedId: selectionMocks.selectedId,
    setSelectedId: selectionMocks.setSelectedId,
  }),
}));

vi.doMock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => true,
}));

vi.doMock('@/actions/subscription.core', () => ({
  cancelSubscription: actionMocks.cancelSubscription,
  getPaymentUpdateUrl: actionMocks.getPaymentUpdateUrl,
}));

vi.doMock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => localeMocks.locale,
}));

vi.doMock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: routerMocks.push,
  }),
}));

vi.doMock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.doMock('@interdomestik/ui', () => ({
  Card: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.doMock('@/app/[locale]/(app)/member/membership/leave-sponsorship.core', () => ({
  leaveCompanyProgramme: vi.fn(),
}));

export const { MembershipOpsPage } = await import('../MembershipOpsPage');

export function setupMembershipOpsPageHarness(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    selectionMocks.selectedId = null;
    localeMocks.locale = 'en';
    timelineMocks.events = [];
    actionMocks.getMembershipActions.mockReturnValue({
      primary: {
        id: 'update_payment',
        label: 'Update payment',
      },
      secondary: [
        {
          id: 'cancel',
          label: 'Cancel membership',
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
