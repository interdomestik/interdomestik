import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  locale: 'en',
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

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionMock,
  requireSessionOrRedirect: (session: unknown) => session,
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
  getTranslations: vi.fn(
    async (namespace?: string) => (key: string, values?: Record<string, string | number>) => {
      const locale = hoisted.locale;

      if (namespace === 'claims-tracking.status') {
        const statusTranslations: Record<string, Record<string, string>> = {
          en: {
            submitted: 'Submitted',
            verification: 'Verification',
            evaluation: 'Evaluation',
            negotiation: 'Negotiation',
            court: 'Court',
          },
          sq: {
            submitted: 'Dorëzuar',
            verification: 'Verifikim',
            evaluation: 'Vlerësim',
            negotiation: 'Negociim',
            court: 'Gjykatë',
          },
        };

        return statusTranslations[locale]?.[key] ?? key;
      }

      const translationsByLocale: Record<string, Record<string, string>> = {
        en: {
          claims_queue: 'Claims Queue',
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
          'staff_queue.assignment_filter.all_staff': 'My queue + unassigned',
          'staff_queue.assignment_filter.mine': 'Assigned to me',
          'staff_queue.assignment_filter.unassigned': 'Unassigned',
          'staff_queue.assignment_filter.all_branch': 'All branch claims',
          'staff_queue.table.claim': 'Claim',
          'staff_queue.table.member': 'Member',
          'staff_queue.table.status_stage': 'Status + stage',
          'staff_queue.table.updated': 'Updated',
          'staff_queue.table.action': 'Action',
          'staff_queue.table.no_claim_number': 'No claim number',
          'staff_queue.table.no_company': 'No company provided',
          'staff_queue.table.no_member_number': 'No member number',
          'actions.open': 'Open',
        },
        sq: {
          claims_queue: 'Radha Operative e Kërkesave',
          'staff_queue.subtitle': 'Çfarë ka nevojë për veprim sot.',
          'staff_queue.results_count': values?.count === 1 ? '1 rast' : `${values?.count} raste`,
          'staff_queue.search_placeholder': 'Kërko rast, anëtar, kompani ose numër',
          'staff_queue.search': 'Kërko',
          'staff_queue.clear_search': 'Pastro',
          'staff_queue.assignment_filter_label': 'Filtri i caktimit',
          'staff_queue.status_filter_label': 'Filtri i statusit',
          'staff_queue.all_actionable': 'Të gjitha rastet vepruese',
          'staff_queue.empty_filtered': 'Asnjë rast nuk përputhet me filtrat aktualë',
          'staff_queue.empty_default': 'Nuk ka raste në radhë',
          'staff_queue.assignment_state.unassigned': 'Pa përgjegjës',
          'staff_queue.assignment_state.assigned_to_you': 'Caktuar te ju',
          'staff_queue.assignment_state.assigned': 'I caktuar',
          'staff_queue.assignment_filter.all_staff': 'Radha ime + pa përgjegjës',
          'staff_queue.assignment_filter.mine': 'Caktuar te unë',
          'staff_queue.assignment_filter.unassigned': 'Pa përgjegjës',
          'staff_queue.assignment_filter.all_branch': 'Të gjitha rastet e degës',
          'staff_queue.table.claim': 'Rasti',
          'staff_queue.table.member': 'Anëtari',
          'staff_queue.table.status_stage': 'Statusi + faza',
          'staff_queue.table.updated': 'Përditësuar',
          'staff_queue.table.action': 'Veprimi',
          'staff_queue.table.no_claim_number': 'Pa numër rasti',
          'staff_queue.table.no_company': 'Nuk ka kompani të dhënë',
          'staff_queue.table.no_member_number': 'Pa numër anëtarësie',
          'actions.open': 'Hap',
        },
      };

      if (key === 'staff_queue.assignment_state.assigned_to_named') {
        return locale === 'sq' ? `Caktuar te ${values?.name}` : `Assigned to ${values?.name}`;
      }

      return translationsByLocale[locale]?.[key] || key;
    }
  ),
  setRequestLocale: vi.fn((locale: string) => {
    hoisted.locale = locale;
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

import StaffClaimsPage from './_core.entry';

describe('StaffClaimsPage', () => {
  beforeEach(() => {
    hoisted.locale = 'en';
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

  it('builds locale-relative filter hrefs so localized links do not double-prefix the route', async () => {
    const tree = await StaffClaimsPage({
      params: Promise.resolve({ locale: 'sq' }),
      searchParams: Promise.resolve({
        assigned: 'unassigned',
        search: 'Acme',
        status: 'verification',
      }),
    });

    render(tree);

    expect(screen.getByTestId('staff-claims-assigned-filter-all')).toHaveAttribute(
      'href',
      '/staff/claims?status=verification&search=Acme'
    );
    expect(screen.getByTestId('staff-claims-status-filter-all')).toHaveAttribute(
      'href',
      '/staff/claims?assigned=unassigned&search=Acme'
    );
  });

  it('renders localized queue copy on non-English staff routes', async () => {
    hoisted.getStaffClaimsListMock.mockResolvedValueOnce([
      {
        id: 'claim-1',
        claimNumber: null,
        companyName: null,
        title: 'Rast',
        status: 'verification',
        stageLabel: 'Verification',
        updatedAt: '2026-03-01T00:00:00.000Z',
        memberName: 'Anëtar',
        memberNumber: null,
        staffId: null,
      },
    ] as any);

    const tree = await StaffClaimsPage({
      params: Promise.resolve({ locale: 'sq' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByTestId('page-title')).toHaveTextContent('Radha Operative e Kërkesave');
    expect(screen.getByText('Rasti')).toBeInTheDocument();
    expect(screen.getByText('Anëtari')).toBeInTheDocument();
    expect(screen.getByText('Statusi + faza')).toBeInTheDocument();
    expect(screen.getByText('Përditësuar')).toBeInTheDocument();
    expect(screen.getByText('Veprimi')).toBeInTheDocument();
    expect(screen.getByTestId('staff-claims-assigned-filter-unassigned')).toHaveTextContent(
      'Pa përgjegjës'
    );
    expect(screen.getByTestId('staff-claims-status-filter-verification')).toHaveTextContent(
      'Verifikim'
    );
    expect(screen.getAllByText('Verifikim').length).toBeGreaterThan(0);
    expect(screen.queryByText('Verification')).not.toBeInTheDocument();
    expect(screen.getByText('Pa numër rasti')).toBeInTheDocument();
    expect(screen.getByText('Nuk ka kompani të dhënë')).toBeInTheDocument();
    expect(screen.getByText('Pa numër anëtarësie')).toBeInTheDocument();
    expect(screen.getByTestId('staff-claim-assignment-state')).toHaveTextContent('Pa përgjegjës');
    expect(screen.getByTestId('staff-claims-view')).toHaveTextContent('Hap');
  });
});
