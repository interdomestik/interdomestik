import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { StaffClaimsListItem } from '@interdomestik/domain-claims';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import agentClaimsCatalog from '@/messages/en/agent-claims.json';
import claimsTrackingCatalog from '@/messages/en/claims-tracking.json';

// Page-level wiring of the rebuilt queue: which empty state, which heading levels and which
// settled summary the page itself chooses (the component tests supply these as inputs).
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getSession: vi.fn(),
  getClaims: vi.fn(),
  getAttention: vi.fn(),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: Readonly<{ children: ReactNode; href: string; prefetch?: boolean }>) => (
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
  ClaimStatusBadge: ({ status }: Readonly<{ status: string | null }>) => <span>{status}</span>,
}));
vi.mock('next-intl/server', async () => {
  // The shared setup mocks next-intl; the page copy comes from the real English catalogues.
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
  const messages = { ...agentClaimsCatalog, ...claimsTrackingCatalog };
  return {
    setRequestLocale: vi.fn(),
    getTranslations: vi.fn((args: Readonly<{ locale: string; namespace: string }>) =>
      Promise.resolve(
        createTranslator({ locale: 'en', messages, namespace: args.namespace as never })
      )
    ),
  };
});
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

import StaffClaimsPage from './_core.entry';

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

function sessionFor(role: 'staff' | 'branch_manager') {
  return { user: { id: 'user-1', role, tenantId: 'tenant-ks', branchId: 'branch-1' } };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  render(
    await StaffClaimsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve(searchParams),
    })
  );
}

describe('StaffClaimsPage queue wiring', () => {
  beforeEach(() => {
    mocks.authorize.mockReset().mockResolvedValue(mintTestTenantAuthority('tenant-ks'));
    mocks.getSession.mockReset().mockResolvedValue(sessionFor('branch_manager'));
    mocks.getClaims.mockReset().mockResolvedValue([]);
    mocks.getAttention.mockReset().mockResolvedValue({});
  });

  it('treats a search alone as filtered: filtered empty copy and a Clear filters link', async () => {
    await renderPage({ search: 'no matching claim' });

    const empty = within(screen.getByTestId('staff-claims-empty'));
    expect(empty.getByText('No claims match the current filters')).toBeVisible();
    expect(empty.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/en/staff/claims'
    );
  });

  it('shows the default empty copy without Clear filters when nothing is filtered', async () => {
    await renderPage();

    expect(screen.getByTestId('staff-claims-empty')).toHaveTextContent('No claims in queue');
    expect(screen.queryByRole('link', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('groups the staff queue: group h2 and claim h3', async () => {
    mocks.getSession.mockResolvedValueOnce(sessionFor('staff'));
    mocks.getClaims.mockResolvedValueOnce([queueClaim]);
    await renderPage();

    const group = screen.getByRole('region', { name: 'Unassigned cases' });
    expect(within(group).getByRole('heading', { level: 2 })).toBe(
      screen.getByTestId('staff-claims-group-unassigned')
    );
    expect(within(group).getByRole('heading', { level: 3, name: 'Rast' })).toBeVisible();
  });

  it('keeps the branch-manager queue flat: claim h2 and no h3', async () => {
    mocks.getClaims.mockResolvedValueOnce([queueClaim]);
    await renderPage();

    const queue = within(screen.getByTestId('staff-claims-queue'));
    expect(queue.getAllByRole('heading', { level: 2 })).toEqual([
      queue.getByRole('heading', { level: 2, name: 'Rast' }),
    ]);
    expect(queue.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('names every active filter and the search in the settled status', async () => {
    await renderPage({
      assigned: 'unassigned',
      diaspora: 'diaspora',
      search: 'Acme',
      status: 'verification',
    });

    expect(screen.getByRole('status').textContent).toBe(
      '0 claims for “Acme” Filters: Unassigned, Verification and Diaspora / Green Card'
    );
  });
});
