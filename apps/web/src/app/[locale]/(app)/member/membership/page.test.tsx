import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getDocumentsMock: vi.fn(async () => []),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      tenantId: 'tenant-ks',
    },
  })),
  getSubscriptionsMock: vi.fn(async () => []),
  getTranslationsMock: vi.fn(async (options?: { namespace?: string } | string) => {
    const namespace =
      typeof options === 'string'
        ? `${options}.`
        : options?.namespace
          ? `${options.namespace}.`
          : '';
    return (key: string) => `${namespace}${key}`;
  }),
  headersMock: vi.fn(async () => new Headers()),
  membershipOpsPageMock: vi.fn((_: unknown) => <div>membership-ops-page</div>),
  redirectMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
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
    const tree = await MembershipPage();

    render(tree);

    const coverageMatrix = screen.getByTestId('membership-coverage-matrix');

    expect(within(coverageMatrix).getByText('coverageMatrix.title')).toBeInTheDocument();
    expect(within(coverageMatrix).getAllByText('coverageMatrix.rows.guidance.title').length).toBe(
      2
    );
    expect(within(coverageMatrix).getAllByText('coverageMatrix.columns.referral').length).toBe(6);
    expect(screen.getByText('membership-ops-page')).toBeInTheDocument();
  });
});
