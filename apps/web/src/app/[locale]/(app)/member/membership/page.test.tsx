import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
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
  admitMock: vi.fn(() =>
    Promise.resolve({
      user: {
        id: 'member-1',
        tenantId: 'tenant-ks',
      },
    })
  ),
  getSubscriptionsMock: vi.fn(async () => []),
  getLeaveMock: vi.fn(async () => 'entry-future'),
  membershipOpsPageMock: vi.fn((props: { coverage?: ReactNode }) => (
    <div data-testid="membership-ops-page">
      membership-ops-page
      {props.coverage}
    </div>
  )),
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

vi.mock('@/lib/privacy/require-member-acceptance', () => ({
  requireMemberAcceptancePage: async () => ({
    ok: true,
    authorized: { session: await hoisted.admitMock() },
  }),
}));
vi.mock('@/components/privacy/member-acceptance-form', () => ({
  MemberAcceptanceForm: () => null,
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
  MembershipOpsPage: (props: { coverage?: ReactNode }) => hoisted.membershipOpsPageMock(props),
}));

import MembershipPage from './page';

describe('MembershipPage commercial coverage matrix', () => {
  it('renders the shared coverage matrix inside the membership screen, after its status', async () => {
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
    expect(hoisted.admitMock).toHaveBeenCalledOnce();
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
    // The matrix is a slot of the screen, so it renders below the status the screen leads with.
    expect(
      within(screen.getByTestId('membership-ops-page')).getByTestId('membership-coverage-matrix')
    ).toBeInTheDocument();
    expect(screen.getByTestId('membership-page-ready')).toContainElement(
      screen.getByTestId('membership-ops-page')
    );
    // No subscription record: a bound future sponsorship still reaches the leave action.
    expect(hoisted.membershipOpsPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ leaveEntryId: 'entry-future' })
    );
  });
});
