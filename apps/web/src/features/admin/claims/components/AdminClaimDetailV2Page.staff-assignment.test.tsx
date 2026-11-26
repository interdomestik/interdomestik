import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StaffRow = Readonly<{ id: string; name: string | null; email: string }>;
type CardProps = Readonly<{
  allStaff: readonly StaffRow[];
  canAssign?: boolean;
  readOnly?: boolean;
}>;
type HeaderProps = Readonly<{ showAssignee: boolean; claim: { ownerName: string } }>;

const mocks = vi.hoisted(() => ({
  getOpsClaimDetail: vi.fn(),
  claimHeader: vi.fn<(props: HeaderProps) => void>(),
  nextActionsCard: vi.fn<(props: CardProps) => void>(),
  evidencePanel: vi.fn(),
  messagingPanel: vi.fn<(props: { allowInternal?: boolean }) => void>(),
}));

vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/features/admin/claims/server/getOpsClaimDetail', () => ({
  getOpsClaimDetail: mocks.getOpsClaimDetail,
}));
vi.mock('./detail/ClaimDetailReadControls', () => ({
  ClaimStaffSearch: () => <div data-testid="staff-search" />,
  ClaimDetailPageLinks: () => null,
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
vi.mock('@/features/claims/communication/claim-message-summary', () => ({
  ClaimMessageSummary: () => <section data-testid="claim-message-summary" />,
}));
vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: (props: { allowInternal?: boolean }) => {
    mocks.messagingPanel(props);
    return null;
  },
}));
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
  EvidencePanel: (props: unknown) => {
    mocks.evidencePanel(props);
    return null;
  },
}));

import { AdminClaimDetailV2Page } from './AdminClaimDetailV2Page';

const STAFF_READ: readonly StaffRow[] = [
  { id: 'staff-1', name: 'Sara Staff', email: 'sara@example.test' },
];

function signIn(role: string, branchId: string | null = null, items = STAFF_READ) {
  const admin = ['admin', 'tenant_admin', 'super_admin'].includes(role);
  mocks.getOpsClaimDetail.mockResolvedValue({
    kind: 'ok',
    data: { id: 'claim-1', docs: [], ownerName: 'Assignee outside this page' },
    authorized: {
      session: {
        user: { id: 'actor-1', role, name: 'Actor', image: null, tenantId: 'tenant-1', branchId },
      },
      authority: mintTestTenantAuthority('tenant-1', { userId: 'actor-1', role }),
    },
    staffPage: admin ? { items, nextCursor: 'staff-1' } : null,
    documentsNextCursor: null,
  });
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
  mocks.getOpsClaimDetail.mockResolvedValue({ kind: 'not_found' });
});

describe('AdminClaimDetailV2Page staff assignment data', () => {
  it('fails into the route error boundary when an assigning admin cannot read staff', async () => {
    signIn('admin');
    mocks.getOpsClaimDetail.mockRejectedValueOnce(new Error('Failed to load assignable staff'));

    await expect(AdminClaimDetailV2Page({ id: 'claim-1', locale: 'en' })).rejects.toThrow(
      'Failed to load assignable staff'
    );
    expect(mocks.nextActionsCard).not.toHaveBeenCalled();
  });

  it('keeps a successful empty staff read as an empty assignable state', async () => {
    signIn('admin', null, []);

    await renderPage();

    expect(screen.getByTestId('next-actions-card')).toBeInTheDocument();
    expect(lastCardProps()).toMatchObject({ allStaff: [], canAssign: true });
    expect(screen.getByTestId('staff-search')).toBeInTheDocument();
    expect(mocks.getOpsClaimDetail).toHaveBeenCalledWith('claim-1', {});
  });

  it('offers the eligible staff page and keeps the separately loaded assignee', async () => {
    signIn('admin');

    await renderPage();

    expect(lastCardProps().allStaff.map(member => member.id)).toEqual(['staff-1']);
    expect(lastCardProps().canAssign).toBe(true);
    expect(mocks.claimHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showAssignee: true,
        claim: expect.objectContaining({ ownerName: 'Assignee outside this page' }),
      })
    );
  });

  it.each(['tenant_admin', 'super_admin'])('lets %s assign', async role => {
    signIn(role);

    await renderPage();

    expect(lastCardProps().canAssign).toBe(true);
  });

  it('keeps branch managers read-only without failing when staff is unreadable', async () => {
    signIn('branch_manager', 'branch-1');

    await renderPage();

    expect(lastCardProps()).toMatchObject({ allStaff: [], canAssign: false });
    expect(screen.getByTestId('claim-message-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-search')).not.toBeInTheDocument();
  });
});

describe('AdminClaimDetailV2Page ops read-only forwarding', () => {
  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'forwards an editable ops card to %s',
    async role => {
      signIn(role);

      await renderPage();

      expect(lastCardProps()).toMatchObject({ canAssign: true, readOnly: false });
    }
  );

  it('forwards an explicit read-only card to a branch manager', async () => {
    signIn('branch_manager', 'branch-1');

    await renderPage();

    expect(lastCardProps()).toMatchObject({ canAssign: false, readOnly: true });
    expect(mocks.evidencePanel).toHaveBeenCalledWith(
      expect.objectContaining({ viewerRole: 'branch_manager', readOnly: true })
    );
  });

  it('renders no card for a branch manager without a branch', async () => {
    await expect(AdminClaimDetailV2Page({ id: 'claim-1', locale: 'en' })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(mocks.nextActionsCard).not.toHaveBeenCalled();
  });

  it.each(['staff', 'agent', 'member'])(
    'forwards a read-only card to a %s viewer admitted by visibility',
    async role => {
      signIn(role);

      await renderPage();

      expect(lastCardProps()).toMatchObject({ canAssign: false, readOnly: true });
    }
  );
});

describe('AdminClaimDetailV2Page internal notes', () => {
  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'offers %s the internal-note toggle',
    async role => {
      signIn(role);

      await renderPage();

      expect(mocks.messagingPanel).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowInternal: true })
      );
    }
  );

  it.each(['global_support', 'staff', 'agent', 'member'])(
    'keeps %s on public messages only',
    async role => {
      signIn(role);

      await renderPage();

      expect(mocks.messagingPanel).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowInternal: false })
      );
    }
  );

  it('renders no messaging panel for a branch manager', async () => {
    signIn('branch_manager', 'branch-1');

    await renderPage();

    expect(mocks.messagingPanel).not.toHaveBeenCalled();
  });
});
