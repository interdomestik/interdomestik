import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StaffRow = Readonly<{ id: string; name: string | null; email: string; role: string }>;
type CardProps = Readonly<{ allStaff: readonly StaffRow[]; canAssign?: boolean }>;
type HeaderProps = Readonly<{ allStaff: readonly StaffRow[] }>;

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getStaff: vi.fn(),
  getOpsClaimDetail: vi.fn(),
  resolveClaimsVisibility: vi.fn(),
  claimHeader: vi.fn<(props: HeaderProps) => void>(),
  nextActionsCard: vi.fn<(props: CardProps) => void>(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: () => 'tenant-1' }));
vi.mock('@/actions/admin-users', () => ({ getStaff: mocks.getStaff }));
vi.mock('@/features/admin/claims/server/getOpsClaimDetail', () => ({
  getOpsClaimDetail: mocks.getOpsClaimDetail,
}));
vi.mock('../server', () => ({
  canViewAdminClaims: () => true,
  resolveClaimsVisibility: mocks.resolveClaimsVisibility,
}));
vi.mock('@/features/admin/claims/components/detail/getNextActions', () => ({
  getNextActions: () => ({ primary: { type: 'assign' }, secondary: [], allowedTransitions: [] }),
}));
vi.mock('@/features/admin/claims/components/ops/ClaimHeader', () => ({
  ClaimHeader: (props: HeaderProps) => {
    mocks.claimHeader(props);
    return null;
  },
}));
vi.mock('@/features/admin/claims/components/ops/NextActionsCard', () => ({
  NextActionsCard: (props: CardProps) => {
    mocks.nextActionsCard(props);
    return <div data-testid="next-actions-card" />;
  },
}));
vi.mock('@/components/messaging/messaging-panel', () => ({ MessagingPanel: () => null }));
vi.mock('@/features/admin/claims/components/detail/ClaimOpsTimelineSection', () => ({
  ClaimOpsTimelineSection: () => null,
}));
vi.mock('@/features/admin/claims/components/ops/ClaimDescriptionCard', () => ({
  ClaimDescriptionCard: () => null,
}));
vi.mock('@/features/admin/claims/components/ops/ClaimantInfoCard', () => ({
  ClaimantInfoCard: () => null,
}));
vi.mock('@/features/admin/claims/components/ops/EvidencePanel', () => ({
  EvidencePanel: () => null,
}));

import { AdminClaimDetailV2Page } from './AdminClaimDetailV2Page';

const STAFF_READ: readonly StaffRow[] = [
  { id: 'staff-1', name: 'Sara Staff', email: 'sara@example.test', role: 'staff' },
  { id: 'tadmin-1', name: 'Tina Admin', email: 'tina@example.test', role: 'tenant_admin' },
  { id: 'bm-1', name: 'Bora Manager', email: 'bora@example.test', role: 'branch_manager' },
];

function signIn(role: string, branchId: string | null = null) {
  mocks.getSession.mockResolvedValue({
    user: { id: 'actor-1', role, name: 'Actor', image: null, tenantId: 'tenant-1', branchId },
  });
  mocks.resolveClaimsVisibility.mockResolvedValue({ role, branchId });
}

async function renderPage() {
  render(await AdminClaimDetailV2Page({ id: 'claim-1', locale: 'en' }));
}

function lastCardProps(): CardProps {
  const call = mocks.nextActionsCard.mock.lastCall;
  if (!call) throw new Error('NextActionsCard was not rendered');
  return call[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOpsClaimDetail.mockResolvedValue({ kind: 'ok', data: { id: 'claim-1', docs: [] } });
});

describe('AdminClaimDetailV2Page staff assignment data', () => {
  it('fails into the route error boundary when an assigning admin cannot read staff', async () => {
    signIn('admin');
    mocks.getStaff.mockResolvedValue({
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    });

    await expect(AdminClaimDetailV2Page({ id: 'claim-1', locale: 'en' })).rejects.toThrow(
      'Failed to load assignable staff'
    );
    expect(mocks.nextActionsCard).not.toHaveBeenCalled();
  });

  it('keeps a successful empty staff read as an empty assignable state', async () => {
    signIn('admin');
    mocks.getStaff.mockResolvedValue({ success: true, data: [] });

    await renderPage();

    expect(screen.getByTestId('next-actions-card')).toBeInTheDocument();
    expect(lastCardProps()).toMatchObject({ allStaff: [], canAssign: true });
  });

  it('offers only staff-role targets while the header keeps every staff row', async () => {
    signIn('admin');
    mocks.getStaff.mockResolvedValue({ success: true, data: STAFF_READ });

    await renderPage();

    expect(lastCardProps().allStaff.map(member => member.id)).toEqual(['staff-1']);
    expect(lastCardProps().canAssign).toBe(true);
    expect(mocks.claimHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({ allStaff: STAFF_READ })
    );
  });

  it.each(['tenant_admin', 'super_admin'])('lets %s assign', async role => {
    signIn(role);
    mocks.getStaff.mockResolvedValue({ success: true, data: STAFF_READ });

    await renderPage();

    expect(lastCardProps().canAssign).toBe(true);
  });

  it('keeps branch managers read-only without failing when staff is unreadable', async () => {
    signIn('branch_manager', 'branch-1');
    mocks.getStaff.mockResolvedValue({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });

    await renderPage();

    expect(lastCardProps()).toMatchObject({ allStaff: [], canAssign: false });
  });
});
