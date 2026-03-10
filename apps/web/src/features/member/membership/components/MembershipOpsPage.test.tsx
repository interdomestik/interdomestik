import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ops', () => ({
  OpsActionBar: () => null,
  OpsDocumentsPanel: () => null,
  OpsStatusBadge: () => null,
  OpsTable: ({ emptyLabel }: { emptyLabel: string }) => <div>{emptyLabel}</div>,
  OpsTimeline: () => null,
}));

vi.mock('@/components/ops/adapters/membership', () => ({
  getMembershipActions: () => ({
    primary: null,
    secondary: [],
  }),
  toOpsDocuments: () => [],
  toOpsStatus: () => ({ label: 'active', variant: 'default' }),
  toOpsTimelineEvents: () => [],
}));

vi.mock('@/components/ops/useOpsSelectionParam', () => ({
  useOpsSelectionParam: () => ({
    selectedId: null,
    setSelectedId: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => true,
}));

vi.mock('@/actions/memberships', () => ({
  getCustomerPortalUrl: vi.fn(),
  requestCancellation: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@interdomestik/ui', () => ({
  Card: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { MembershipOpsPage } from './MembershipOpsPage';

describe('MembershipOpsPage', () => {
  it('shows scope and referral boundaries alongside membership operations', () => {
    render(<MembershipOpsPage subscriptions={[]} documents={[]} />);

    expect(screen.getByText('disclaimers.freeStart.title')).toBeInTheDocument();
    expect(screen.getByText('disclaimers.hotline.title')).toBeInTheDocument();
    expect(screen.getByText('scope.title')).toBeInTheDocument();
    expect(screen.getByText('scope.guidance.title')).toBeInTheDocument();
    expect(screen.getByText('scope.outOfScope.title')).toBeInTheDocument();
    expect(screen.getByText('scope.boundary.title')).toBeInTheDocument();
  });
});
