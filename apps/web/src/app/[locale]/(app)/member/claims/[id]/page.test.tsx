import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      name: 'Member One',
      image: null,
      role: 'member',
      tenantId: 'tenant-ks',
    },
  })),
  getMemberClaimDetailMock: vi.fn(async () => ({
    id: 'claim-1',
    title: 'Member Claim',
    status: 'evaluation',
    slaPhase: 'running',
    statusLabelKey: 'claims-tracking.status.evaluation',
    createdAt: new Date('2026-03-14T10:00:00.000Z'),
    updatedAt: new Date('2026-03-14T11:00:00.000Z'),
    description: 'Claim description',
    amount: '120',
    currency: 'EUR',
    canShare: false,
    documents: [],
    timeline: [],
    matterAllowance: null,
  })),
  memberClaimDetailOpsPageMock: vi.fn((props: unknown) => (
    <div data-testid="member-claim-detail-ops-page">{JSON.stringify(props)}</div>
  )),
  redirectMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
  notFound: hoisted.notFoundMock,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('@/features/claims/tracking/server/getMemberClaimDetail', () => ({
  getMemberClaimDetail: hoisted.getMemberClaimDetailMock,
}));

vi.mock('@/features/member/claims/components/MemberClaimDetailOpsPage', () => ({
  MemberClaimDetailOpsPage: (props: unknown) => hoisted.memberClaimDetailOpsPageMock(props),
}));

import ClaimDetailsPage from './page';

describe('ClaimDetailsPage', () => {
  it('passes the authenticated member identity to the canonical member detail UI', async () => {
    const tree = await ClaimDetailsPage({
      params: Promise.resolve({
        locale: 'en',
        id: 'claim-1',
      }),
    });

    render(tree);

    expect(screen.getByTestId('member-claim-detail-ops-page')).toBeInTheDocument();
    expect(hoisted.getSessionSafeMock).toHaveBeenCalledWith('MemberClaimDetailsPage');
    expect(hoisted.memberClaimDetailOpsPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUser: {
          id: 'member-1',
          name: 'Member One',
          image: null,
          role: 'member',
        },
      })
    );
  });
});
