import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'staff-1',
      tenantId: 'tenant-ks',
      role: 'staff',
      branchId: 'branch-a',
    },
  })),
  getStaffClaimDetailMock: vi.fn(async () => ({
    claim: {
      id: 'claim-1',
      claimNumber: 'KS-0001',
      status: 'negotiation',
      staffId: 'staff-1',
      stageLabel: 'Negotiation',
      submittedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
    member: {
      id: 'member-1',
      fullName: 'Member One',
      membershipNumber: 'MEM-001',
    },
    agent: {
      id: 'agent-1',
      name: 'Agent One',
    },
    matterAllowance: {
      allowanceTotal: 2,
      consumedCount: 0,
      remainingCount: 2,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2026-12-31T23:59:59.000Z',
    },
    recoveryDecision: {
      status: 'pending',
      decidedAt: null,
      explanation: null,
      declineReasonCode: null,
      staffLabel: 'Pending staff decision',
      memberLabel: null,
      memberDescription: null,
    },
    commercialAgreement: null,
    successFeeCollection: null,
  })),
  getLatestPublicStatusNoteCoreMock: vi.fn(async () => null),
  getStaffAssignmentOptionsMock: vi.fn(async () => []),
  messagingPanelMock: vi.fn(
    ({
      allowInternal,
      claimId,
      currentUser,
    }: {
      allowInternal?: boolean;
      claimId: string;
      currentUser: { role: string };
    }) => (
      <div
        data-testid="staff-claim-messaging-panel"
        data-allow-internal={String(Boolean(allowInternal))}
        data-claim-id={claimId}
        data-role={currentUser.role}
      />
    )
  ),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@interdomestik/domain-claims', () => ({
  getStaffClaimDetail: hoisted.getStaffClaimDetailMock,
}));

vi.mock('./_core', () => ({
  getLatestPublicStatusNoteCore: hoisted.getLatestPublicStatusNoteCoreMock,
}));

vi.mock('@/features/staff/claims/assignment-options', () => ({
  getStaffAssignmentOptions: hoisted.getStaffAssignmentOptionsMock,
}));

vi.mock('@/components/staff/claim-action-panel', () => ({
  ClaimActionPanel: () => <div data-testid="staff-claim-action-panel" />,
}));

vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: (props: unknown) => hoisted.messagingPanelMock(props as never),
}));

import StaffClaimDetailsPage from './page';

describe('StaffClaimDetailsPage', () => {
  it('renders annual matter usage and remaining allowance on the canonical staff claim detail page', async () => {
    const tree = await StaffClaimDetailsPage({
      params: Promise.resolve({
        locale: 'en',
        id: 'claim-1',
      }),
    });

    render(tree);

    expect(screen.getByTestId('staff-claim-detail-ready')).toBeInTheDocument();
    expect(screen.getByText('Matter allowance')).toBeInTheDocument();
    expect(screen.getByText('Used this year')).toBeInTheDocument();
    expect(screen.getByText('Remaining this year')).toBeInTheDocument();
    expect(screen.getByText('Plan allowance')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getAllByText('2')).toHaveLength(2);
  });

  it('renders claim messaging with internal-note controls on the canonical staff claim detail page', async () => {
    const tree = await StaffClaimDetailsPage({
      params: Promise.resolve({
        locale: 'en',
        id: 'claim-1',
      }),
    });

    render(tree);

    expect(screen.getByTestId('staff-claim-messaging-panel')).toBeInTheDocument();
    expect(hoisted.messagingPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        allowInternal: true,
        currentUser: expect.objectContaining({
          role: 'staff',
        }),
      })
    );
  });
});
