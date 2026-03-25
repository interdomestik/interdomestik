import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'manager-1',
      role: 'branch_manager',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
    },
  })),
  getStaffClaimsListMock: vi.fn(async () => []),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@interdomestik/domain-claims', () => ({
  ACTIONABLE_CLAIM_STATUSES: ['submitted', 'verification', 'evaluation', 'negotiation', 'court'],
  getStaffClaimsList: hoisted.getStaffClaimsListMock,
}));

vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="claim-status-badge">{status}</span>
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      'staff_queue.subtitle': 'What needs action today.',
      'staff_queue.results_count': values?.count === 1 ? '1 claim' : `${values?.count} claims`,
      'staff_queue.search_placeholder': 'Search claim, member, company, or number',
      'staff_queue.search': 'Search',
      'staff_queue.clear_search': 'Clear',
      'staff_queue.assignment_filter_label': 'Assignment filter',
      'staff_queue.status_filter_label': 'Status filter',
      'staff_queue.all_actionable': 'All actionable',
      'staff_queue.empty_filtered': 'No claims match the current filters',
      'staff_queue.empty_default': 'No claims in queue',
      'staff_queue.assignment_state.unassigned': 'Unassigned',
      'staff_queue.assignment_state.assigned_to_you': 'Assigned to you',
      'staff_queue.assignment_state.assigned': 'Assigned',
    };

    if (key === 'staff_queue.assignment_state.assigned_to_named') {
      return `Assigned to ${values?.name}`;
    }

    return translations[key] || key;
  }),
  setRequestLocale: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

import StaffClaimsPage from './_core.entry';

describe('StaffClaimsPage', () => {
  beforeEach(() => {
    hoisted.getSessionMock.mockClear();
    hoisted.getStaffClaimsListMock.mockClear();
    hoisted.getStaffClaimsListMock.mockResolvedValue([]);
  });

  it('passes branch-aware search filters into the staff queue query', async () => {
    const tree = await StaffClaimsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        assigned: 'unassigned',
        search: 'Acme',
        status: 'verification',
      }),
    });

    render(tree);

    expect(hoisted.getStaffClaimsListMock).toHaveBeenCalledWith({
      assignment: 'unassigned',
      branchId: 'branch-1',
      limit: 20,
      search: 'Acme',
      staffId: 'manager-1',
      status: 'verification',
      tenantId: 'tenant-ks',
      viewerRole: 'branch_manager',
    });
    expect(screen.getByTestId('staff-page-ready')).toBeInTheDocument();
  });

  it('shows assignment state labels in the queue for staff operators', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'staff-1',
        role: 'staff',
        tenantId: 'tenant-ks',
        branchId: 'branch-1',
      },
    });
    hoisted.getStaffClaimsListMock.mockResolvedValueOnce([
      {
        id: 'claim-mine',
        claimNumber: 'KS-0001',
        companyName: 'Acme',
        title: 'Mine',
        status: 'verification',
        stageLabel: 'Verification',
        updatedAt: '2026-03-01T00:00:00.000Z',
        memberName: 'Member One',
        memberNumber: 'M-001',
        staffId: 'staff-1',
      },
      {
        id: 'claim-open',
        claimNumber: 'KS-0002',
        companyName: 'Acme',
        title: 'Open',
        status: 'submitted',
        stageLabel: 'Submitted',
        updatedAt: '2026-03-01T00:00:00.000Z',
        memberName: 'Member Two',
        memberNumber: 'M-002',
        staffId: null,
      },
      {
        id: 'claim-other',
        claimNumber: 'KS-0003',
        companyName: 'Acme',
        title: 'Other',
        status: 'evaluation',
        stageLabel: 'Evaluation',
        updatedAt: '2026-03-01T00:00:00.000Z',
        memberName: 'Member Three',
        memberNumber: 'M-003',
        staffId: 'staff-99',
        assigneeName: 'Agim Ramadani',
        assigneeEmail: 'agim@example.com',
      },
    ] as any);

    const tree = await StaffClaimsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(
      screen.getAllByTestId('staff-claim-assignment-state').map(node => node.textContent)
    ).toEqual(['Assigned to you', 'Unassigned', 'Assigned to Agim Ramadani']);
    expect(screen.getByTestId('staff-claims-results-count')).toHaveTextContent('3 claims');
  });

  it('labels the filter groups as filters instead of tabs', async () => {
    const tree = await StaffClaimsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByTestId('staff-claims-assignment-filters')).toHaveTextContent(
      'Assignment filter'
    );
    expect(screen.getByTestId('staff-claims-status-filters')).toHaveTextContent('Status filter');
  });
});
