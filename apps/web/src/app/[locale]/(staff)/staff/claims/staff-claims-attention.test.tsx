import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { formatPilotDate, formatPilotDateTime } from '@/lib/utils/date';
import type { StaffClaimsListItem } from '@interdomestik/domain-claims';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import deCatalog from '@/messages/de/agent-claims.json';
import enCatalog from '@/messages/en/agent-claims.json';
import mkCatalog from '@/messages/mk/agent-claims.json';
import sqCatalog from '@/messages/sq/agent-claims.json';
import sqClaimsCatalog from '@/messages/sq/claims.json';
import srCatalog from '@/messages/sr/agent-claims.json';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  locale: 'en',
  getSession: vi.fn(async () => ({
    user: { id: 'manager-1', role: 'branch_manager', tenantId: 'tenant-ks', branchId: 'branch-1' },
  })),
  getClaims: vi.fn<() => Promise<StaffClaimsListItem[]>>(async () => []),
  getAttention: vi.fn(async () => ({})),
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
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/features/staff/claims/server/authorize-staff-claim-page', () => ({
  authorizeStaffClaimPage: mocks.authorize,
}));
vi.mock('@/components/shell/session', () => ({
  getSessionSafe: mocks.getSession,
  requireSessionOrRedirect: (session: unknown) => session,
}));
vi.mock('@interdomestik/domain-claims', () => ({
  ACTIONABLE_CLAIM_STATUSES: ['submitted', 'verification', 'evaluation', 'negotiation', 'court'],
  getStaffClaimsList: mocks.getClaims,
  getAssignedStaffClaimAttention: mocks.getAttention,
  parseDiasporaOriginFilter: (value?: string | null) => (value === 'diaspora' ? 'diaspora' : 'all'),
}));
vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: Readonly<{ status: string | null }>) => {
    const labels: Readonly<Record<string, string>> = sqClaimsCatalog.claims.status;
    const key = status ?? 'Unknown';
    return (
      <span data-testid="claim-status-badge">
        {mocks.locale === 'sq' ? (labels[key] ?? key) : key}
      </span>
    );
  },
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn((locale: string) => {
    mocks.locale = locale;
  }),
  getTranslations: vi.fn(
    async (namespace?: string | { locale: string; namespace?: string }) =>
      (key: string, values?: Record<string, string | number>) => {
        const ns = typeof namespace === 'string' ? namespace : namespace?.namespace;
        if (ns === 'claims-tracking.status') {
          const sqStatus: Record<string, string> = {
            submitted: 'Dorëzuar',
            verification: 'Verifikim',
            evaluation: 'Vlerësim',
            negotiation: 'Negociim',
            court: 'Gjykatë',
          };
          return mocks.locale === 'sq' ? (sqStatus[key] ?? key) : key;
        }
        if (key === 'staff_queue.results_count') {
          const count = values?.count ?? 0;
          return mocks.locale === 'sq'
            ? `${count} ${count === 1 ? 'rast' : 'raste'}`
            : `${count} ${count === 1 ? 'claim' : 'claims'}`;
        }
        const catalogs = {
          de: deCatalog,
          en: enCatalog,
          mk: mkCatalog,
          sq: sqCatalog,
          sr: srCatalog,
        };
        const catalog = catalogs[mocks.locale as keyof typeof catalogs];
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
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

import StaffClaimsPage from './_core.entry';

const authority = mintTestTenantAuthority('tenant-ks');
const queueClaim: StaffClaimsListItem = {
  id: 'claim-1',
  claimNumber: null,
  companyName: null,
  title: 'Rast',
  status: 'verification',
  stageLabel: 'Verification',
  updatedAt: '2026-09-27T22:30:00.000Z',
  memberName: 'Anëtar',
  memberNumber: null,
  staffId: null,
  isDiasporaOrigin: false,
  diasporaCountry: null,
};

describe('staff claim attention', () => {
  beforeEach(() => {
    mocks.authorize.mockReset().mockResolvedValue(authority);
    mocks.locale = 'en';
    mocks.getSession.mockReset().mockResolvedValue({
      user: {
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-ks',
        branchId: 'branch-1',
      },
    });
    mocks.getClaims.mockReset().mockResolvedValue([]);
    mocks.getAttention.mockReset().mockResolvedValue({});
  });

  it('preserves localized branch-manager queue copy without assigned-staff request progress', async () => {
    mocks.getClaims.mockResolvedValueOnce([queueClaim]);
    render(
      await StaffClaimsPage({
        params: Promise.resolve({ locale: 'sq' }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(screen.getByTestId('page-title')).toHaveTextContent('Radha Operative e Kërkesave');
    expect(screen.getByText('Referenca e rastit')).toBeInTheDocument();
    expect(screen.getByText('Anëtari')).toBeInTheDocument();
    expect(screen.getByText('Statusi + faza')).toBeInTheDocument();
    expect(screen.getByText('Përditësuar')).toBeInTheDocument();
    expect(screen.getByText('Caktimi')).toBeInTheDocument();
    expect(screen.getByTestId('staff-claims-assigned-filter-unassigned')).toHaveTextContent(
      'Pa përgjegjës'
    );
    expect(screen.getByTestId('staff-claims-status-filter-verification')).toHaveTextContent(
      'Verifikim'
    );
    expect(screen.getAllByText('Verifikim').length).toBeGreaterThan(0);
    expect(screen.queryByText('Verification')).not.toBeInTheDocument();
    const row = within(screen.getByTestId('staff-claims-row'));
    expect(row.getByTestId('claim-status-badge')).toHaveTextContent('Në Verifikim');
    expect(row.queryByText('Verifikim')).not.toBeInTheDocument();
    expect(screen.getByText('Pa numër rasti')).toBeInTheDocument();
    expect(screen.getByText('Nuk ka kompani të dhënë')).toBeInTheDocument();
    expect(screen.getByText('Pa numër anëtarësie')).toBeInTheDocument();
    expect(screen.getByTestId('staff-claim-assignment-state')).toHaveTextContent('Pa përgjegjës');
    const detailLink = screen.getByTestId('staff-claims-view');
    expect(detailLink).toHaveAttribute('href', '/staff/claims/claim-1');
    expect(detailLink).toHaveTextContent(/^Rast$/);
    expect(row.getAllByRole('link')).toEqual([detailLink]);
    expect(mocks.getAttention).not.toHaveBeenCalled();
    expect(screen.queryByTestId('staff-claim-next-actor')).not.toBeInTheDocument();
  });

  it('uses group h2s and claim h3s in the staff queue', async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-ks', branchId: 'branch-1' },
    });
    mocks.getClaims.mockResolvedValueOnce([queueClaim]);
    render(
      await StaffClaimsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    );

    const group = screen.getByRole('region', { name: 'Unassigned cases' });
    expect(within(group).getByRole('heading', { level: 2 })).toBe(
      screen.getByTestId('staff-claims-group-unassigned')
    );
    const row = within(group).getByRole('listitem');
    expect(within(row).getByRole('heading', { level: 3, name: 'Rast' })).toContainElement(
      screen.getByTestId('staff-claims-view')
    );
  });

  it('uses claim h2s in the flat branch-manager queue', async () => {
    mocks.getClaims.mockResolvedValueOnce([queueClaim]);
    render(
      await StaffClaimsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    );

    const queue = within(screen.getByTestId('staff-claims-queue'));
    const row = within(queue.getByRole('listitem'));
    const heading = row.getByRole('heading', { level: 2, name: 'Rast' });
    expect(queue.getAllByRole('heading', { level: 2 })).toEqual([heading]);
    expect(queue.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('shows the updated date in the pilot time zone and format', async () => {
    mocks.getClaims.mockResolvedValueOnce([queueClaim]);
    render(
      await StaffClaimsPage({
        params: Promise.resolve({ locale: 'sq' }),
        searchParams: Promise.resolve({}),
      })
    );

    const row = within(screen.getByTestId('staff-claims-row'));
    const pilotDate = formatPilotDate(queueClaim.updatedAt, 'sq', '');
    expect(row.getByText(pilotDate, { selector: 'dd' })).toHaveTextContent('28.09.2026');
  });

  it('shows the stage label alongside the badge when status is null', async () => {
    mocks.getClaims.mockResolvedValueOnce([{ ...queueClaim, status: null, stageLabel: 'Intake' }]);
    render(
      await StaffClaimsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    );

    const badge = screen.getByTestId('claim-status-badge');
    expect(badge).toHaveTextContent('Unknown');
    expect(badge.closest('dd')).toHaveTextContent('Intake');
  });

  it.each(['en', 'sq', 'mk', 'sr', 'de'])(
    'groups assigned work and saved-date follow-ups in %s',
    async locale => {
      mocks.getSession.mockResolvedValueOnce({
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-ks', branchId: 'branch-1' },
      });
      mocks.getClaims.mockResolvedValueOnce([
        { id: 'claim-member', title: 'Member wait', status: 'verification', staffId: 'staff-1' },
        { id: 'claim-staff', title: 'Staff review', status: 'verification', staffId: 'staff-1' },
        { id: 'claim-no-request', title: 'No request', status: 'verification', staffId: 'staff-1' },
      ] as never);
      mocks.getAttention.mockResolvedValueOnce({
        'claim-member': { nextActor: 'member', overdueFollowUpDueAt: '2026-09-28T09:00:00.000Z' },
        'claim-staff': { nextActor: 'staff', overdueFollowUpDueAt: null },
        'claim-no-request': {
          nextActor: 'untracked',
          // 22:30 UTC is 00:30 the next day in Skopje (CEST): the pilot-time date, not UTC's.
          overdueFollowUpDueAt: '2026-09-27T22:30:00.000Z',
          overdueFollowUpSource: 'case_register',
        },
      });
      render(
        await StaffClaimsPage({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ assigned: 'mine' }),
        })
      );

      const catalog = {
        de: deCatalog,
        en: enCatalog,
        mk: mkCatalog,
        sq: sqCatalog,
        sr: srCatalog,
      }[locale as 'de' | 'en' | 'mk' | 'sq' | 'sr'];
      const copy = catalog['agent-claims'].claims.staff_queue.attention;
      expect(screen.getByTestId('staff-claims-group-staff')).toHaveTextContent(copy.group.staff);
      expect(screen.getByTestId('staff-claims-group-member')).toHaveTextContent(copy.group.member);
      expect(screen.getByTestId('staff-claims-group-untracked')).toHaveTextContent(
        copy.group.untracked
      );
      expect(
        screen
          .getAllByTestId('staff-claims-row')
          .map(row => row.querySelector('[data-testid="staff-claim-title"]')?.textContent)
      ).toEqual(['Staff review', 'Member wait', 'No request']);
      const [requestFollowUp, registerFollowUp] = screen.getAllByTestId(
        'staff-claim-overdue-follow-up'
      );
      expect(requestFollowUp).toHaveTextContent(copy.overdue_follow_up.split('{date}')[0]);
      expect(registerFollowUp).toHaveTextContent(
        copy.overdue_register_follow_up.split('{date}')[0]
      );
      expect(registerFollowUp).not.toHaveTextContent(copy.overdue_follow_up.split('{date}')[0]);
      expect(registerFollowUp).toHaveTextContent(
        formatPilotDateTime('2026-09-27T22:30:00.000Z', locale, '')
      );
      expect(registerFollowUp).toHaveTextContent('00:30');
      expect(mocks.getAttention).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ id: 'staff-1' }) }),
        authority,
        ['claim-member', 'claim-staff', 'claim-no-request']
      );
      expect((mocks.getAttention.mock.calls[0] as unknown as unknown[])[1]).toBe(authority);
    }
  );

  it('renders not found and reads nothing without an authorized session', async () => {
    mocks.authorize.mockResolvedValue(null);
    await expect(
      StaffClaimsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('notFound');
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.getAttention).not.toHaveBeenCalled();
  });

  it('propagates an assigned-request read failure instead of showing an empty queue', async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-ks', branchId: 'branch-1' },
    });
    mocks.getClaims.mockResolvedValueOnce([
      { id: 'claim-1', staffId: 'staff-1', status: 'verification' },
    ] as never);
    mocks.getAttention.mockRejectedValueOnce(new Error('request read failed'));
    await expect(
      StaffClaimsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('request read failed');
  });
});
