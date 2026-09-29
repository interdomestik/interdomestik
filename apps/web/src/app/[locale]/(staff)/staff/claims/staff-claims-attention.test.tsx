import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enCatalog from '@/messages/en/agent-claims.json';
import mkCatalog from '@/messages/mk/agent-claims.json';
import sqCatalog from '@/messages/sq/agent-claims.json';
import srCatalog from '@/messages/sr/agent-claims.json';

const mocks = vi.hoisted(() => ({
  locale: 'en',
  getSession: vi.fn(async () => ({
    user: { id: 'manager-1', role: 'branch_manager', tenantId: 'tenant-ks', branchId: 'branch-1' },
  })),
  getClaims: vi.fn(async () => []),
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
  ClaimStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn((locale: string) => {
    mocks.locale = locale;
  }),
  getTranslations: vi.fn(
    async (namespace?: string) => (key: string, values?: Record<string, string | number>) => {
      if (namespace === 'claims-tracking.status') {
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
      const catalogs = { en: enCatalog, mk: mkCatalog, sq: sqCatalog, sr: srCatalog };
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

describe('staff claim attention', () => {
  beforeEach(() => {
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
    mocks.getClaims.mockResolvedValueOnce([
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
    ] as never);
    render(
      await StaffClaimsPage({
        params: Promise.resolve({ locale: 'sq' }),
        searchParams: Promise.resolve({}),
      })
    );

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
    expect(mocks.getAttention).not.toHaveBeenCalled();
    expect(screen.queryByTestId('staff-claim-next-actor')).not.toBeInTheDocument();
  });

  it.each(['en', 'sq', 'mk', 'sr'])(
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
        'claim-no-request': { nextActor: 'untracked', overdueFollowUpDueAt: null },
      });
      render(
        await StaffClaimsPage({
          params: Promise.resolve({ locale }),
          searchParams: Promise.resolve({ assigned: 'mine' }),
        })
      );

      const catalog = { en: enCatalog, mk: mkCatalog, sq: sqCatalog, sr: srCatalog }[
        locale as 'en' | 'mk' | 'sq' | 'sr'
      ];
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
      expect(screen.getByTestId('staff-claim-overdue-follow-up')).toHaveTextContent(
        copy.overdue_follow_up.split('{date}')[0]
      );
      expect(mocks.getAttention).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ id: 'staff-1' }) }),
        ['claim-member', 'claim-staff', 'claim-no-request']
      );
    }
  );

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
