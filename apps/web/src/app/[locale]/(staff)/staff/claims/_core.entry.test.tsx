import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enCatalog from '@/messages/en/agent-claims.json';
import mkCatalog from '@/messages/mk/agent-claims.json';
import sqCatalog from '@/messages/sq/agent-claims.json';
import srCatalog from '@/messages/sr/agent-claims.json';

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
  getAssignedStaffClaimAttentionMock: vi.fn(async () => ({})),
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
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionMock,
  requireSessionOrRedirect: (session: unknown) => session,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  ACTIONABLE_CLAIM_STATUSES: ['submitted', 'verification', 'evaluation', 'negotiation', 'court'],
  getStaffClaimsList: hoisted.getStaffClaimsListMock,
  getAssignedStaffClaimAttention: hoisted.getAssignedStaffClaimAttentionMock,
  parseDiasporaOriginFilter: (value?: string | null) => (value === 'diaspora' ? 'diaspora' : 'all'),
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
        const status = {
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
        return (
          (status[locale as keyof typeof status] as Record<string, string> | undefined)?.[key] ??
          key
        );
      }
      if (key === 'staff_queue.results_count') {
        const count = values?.count ?? 0;
        return locale === 'sq'
          ? `${count} ${count === 1 ? 'rast' : 'raste'}`
          : `${count} ${count === 1 ? 'claim' : 'claims'}`;
      }
      const catalogs = { en: enCatalog, mk: mkCatalog, sq: sqCatalog, sr: srCatalog };
      const catalog = catalogs[locale as keyof typeof catalogs];
      const value = key
        .split('.')
        .reduce<unknown>(
          (current, part) =>
            current && typeof current === 'object'
              ? (current as Record<string, unknown>)[part]
              : undefined,
          catalog?.['agent-claims'].claims
        );
      return typeof value === 'string'
        ? value.replace(/\{(name|date)\}/g, (_, field: string) => String(values?.[field] ?? ''))
        : key;
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
    hoisted.getAssignedStaffClaimAttentionMock.mockReset().mockResolvedValue({});
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
      diasporaOrigin: 'all',
      limit: 20,
      search: 'Acme',
      staffId: 'manager-1',
      status: 'verification',
      tenantId: 'tenant-ks',
      viewerRole: 'branch_manager',
    });
    expect(screen.getByTestId('staff-page-ready')).toBeInTheDocument();
    expect(hoisted.getAssignedStaffClaimAttentionMock).not.toHaveBeenCalled();
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
        isDiasporaOrigin: true,
        diasporaCountry: 'DE',
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
    ] as never);

    const tree = await StaffClaimsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(
      screen.getAllByTestId('staff-claim-assignment-state').map(node => node.textContent)
    ).toEqual(['Assigned to you', 'Unassigned', 'Assigned to Agim Ramadani']);
    expect(screen.getByTestId('staff-claim-origin-badge')).toHaveTextContent(
      'Diaspora / Green Card'
    );
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

  it('passes and renders the diaspora filter state in staff queue links', async () => {
    const tree = await StaffClaimsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        diaspora: 'diaspora',
      }),
    });

    render(tree);

    expect(hoisted.getStaffClaimsListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diasporaOrigin: 'diaspora',
      })
    );
    expect(screen.getByTestId('staff-claims-diaspora-filters')).toHaveTextContent('Origin filter');
    expect(screen.getByTestId('staff-claims-diaspora-filter-all')).toHaveAttribute(
      'href',
      '/staff/claims'
    );
    expect(screen.getByDisplayValue('diaspora')).toHaveAttribute('name', 'diaspora');
  });
});
