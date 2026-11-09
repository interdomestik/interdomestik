import { render, screen } from '@testing-library/react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { describe, expect, it, vi } from 'vitest';
import { expectCoverageMatrix, getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

const hoisted = vi.hoisted(() => ({
  ensureTenantIdMock: vi.fn((session: { user: { tenantId?: string } }) => {
    if (!session.user.tenantId) {
      throw new Error('MissingTenantError');
    }
    return session.user.tenantId;
  }),
  getDocumentsMock: vi.fn(async () => []),
  getSessionSafeMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      tenantId: 'tenant-ks',
    },
  })),
  getSubscriptionsMock: vi.fn(async () => []),
  getLeaveMock: vi.fn(async () => 'entry-future'),
  membershipOpsPageMock: vi.fn((_: unknown) => <div>membership-ops-page</div>),
  redirectMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantIdMock,
}));

vi.mock('./_core', () => ({
  getMemberDocumentsCore: hoisted.getDocumentsMock,
  getMemberSubscriptionsCore: hoisted.getSubscriptionsMock,
  getMemberLeavableSponsorEntryCore: hoisted.getLeaveMock,
}));

vi.mock('@/features/member/membership/components/MembershipOpsPage', () => ({
  MembershipOpsPage: (props: unknown) => hoisted.membershipOpsPageMock(props),
}));

import MembershipPage from './page';

describe('MembershipPage commercial coverage matrix', () => {
  it('renders the shared coverage matrix above member operations', async () => {
    const tree = await MembershipPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expectCoverageMatrix({
      columnKey: 'coverageMatrix.columns.referral',
      rowKey: 'coverageMatrix.rows.guidance.title',
      sectionTestId: 'membership-coverage-matrix',
    });
    expect(setRequestLocale).toHaveBeenCalledWith('en');
    expect(getTranslations).toHaveBeenCalledWith({ locale: 'en', namespace: 'coverageMatrix' });
    expect(hoisted.getSessionSafeMock).toHaveBeenCalledWith('MemberMembershipPage');
    expect(hoisted.ensureTenantIdMock).toHaveBeenCalledWith({
      user: {
        id: 'member-1',
        tenantId: 'tenant-ks',
      },
    });
    expect(hoisted.getSubscriptionsMock).toHaveBeenCalledWith({
      userId: 'member-1',
      tenantId: 'tenant-ks',
    });
    expect(hoisted.getDocumentsMock).toHaveBeenCalledWith({
      userId: 'member-1',
      tenantId: 'tenant-ks',
    });
    expect(screen.getByText('membership-ops-page')).toBeInTheDocument();
    // No subscription record: a bound future sponsorship still reaches the leave action.
    expect(hoisted.membershipOpsPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ leaveEntryId: 'entry-future' })
    );
  });
});
