import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCoverageMatrix, getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

const hoisted = vi.hoisted(() => ({
  getDocumentsMock: vi.fn(async () => []),
  getSessionSafeMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      tenantId: 'tenant-ks',
    },
  })),
  getSubscriptionsMock: vi.fn(async () => []),
  membershipOpsPageMock: vi.fn((_: unknown) => <div>membership-ops-page</div>),
  redirectMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
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

vi.mock('./_core', () => ({
  getMemberDocumentsCore: hoisted.getDocumentsMock,
  getMemberSubscriptionsCore: hoisted.getSubscriptionsMock,
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
    expect(hoisted.getSessionSafeMock).toHaveBeenCalledWith('MemberMembershipPage');
    expect(screen.getByText('membership-ops-page')).toBeInTheDocument();
  });
});
