import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      name: 'Test Member',
      tenantId: 'tenant-ks',
      createdAt: new Date('2026-03-01T12:00:00.000Z'),
      memberNumber: 'ID-MEMBER',
    },
  })),
  redirectMock: vi.fn(),
  findFirstMock: vi.fn(async () => ({
    status: 'active',
    planId: 'asistenca',
    currentPeriodEnd: new Date('2027-03-01T12:00:00.000Z'),
    gracePeriodEndsAt: null as Date | null,
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
  setRequestLocale: vi.fn(),
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('@interdomestik/database', () => ({
  and: vi.fn(),
  db: {
    query: {
      subscriptions: {
        findFirst: hoisted.findFirstMock,
      },
    },
  },
  eq: vi.fn(),
  subscriptions: {},
}));

vi.mock('next/link', () => ({
  default: ({ children, href = '#' }: { children: ReactNode; href?: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

import MemberCardPage from './page';

describe('MemberCardPage hotline disclaimer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionSafeMock.mockResolvedValue({
      user: {
        id: 'member-1',
        name: 'Test Member',
        tenantId: 'tenant-ks',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
        memberNumber: 'ID-MEMBER',
      },
    });
    hoisted.findFirstMock.mockResolvedValue({
      status: 'active',
      planId: 'asistenca',
      currentPeriodEnd: new Date('2027-03-01T12:00:00.000Z'),
      gracePeriodEndsAt: null,
    });
  });

  it('renders routing-only hotline copy on the membership card surface', async () => {
    const tree = await MemberCardPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expect(hoisted.getSessionSafeMock).toHaveBeenCalledWith('MemberMembershipCardPage');
    expect(screen.getByText('membership.card.hotline_disclaimer.title')).toBeInTheDocument();
    expect(screen.getByText('membership.card.hotline_disclaimer.body')).toBeInTheDocument();
  });

  it('renders the card for a past_due subscription still inside its grace period', async () => {
    hoisted.findFirstMock.mockResolvedValueOnce({
      status: 'past_due',
      planId: 'asistenca',
      currentPeriodEnd: new Date('2027-03-01T12:00:00.000Z'),
      gracePeriodEndsAt: new Date('2999-03-01T12:00:00.000Z'),
    });

    const tree = await MemberCardPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expect(screen.getByTestId('member-membership-card-ready')).toBeInTheDocument();
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });

  it('redirects when the subscription is not card-eligible', async () => {
    hoisted.findFirstMock.mockResolvedValueOnce({
      status: 'canceled',
      planId: 'asistenca',
      currentPeriodEnd: new Date('2027-03-01T12:00:00.000Z'),
      gracePeriodEndsAt: null,
    });
    hoisted.redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      MemberCardPage({
        params: Promise.resolve({ locale: 'sq' }),
      })
    ).rejects.toThrow('redirect:/sq/member/membership');

    expect(hoisted.redirectMock).toHaveBeenCalledWith('/sq/member/membership');
  });

  it('redirects to the localized login page when the membership card is opened without a session', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce(null as never);
    hoisted.redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      MemberCardPage({
        params: Promise.resolve({ locale: 'mk' }),
      })
    ).rejects.toThrow('redirect:/mk/login');

    expect(hoisted.redirectMock).toHaveBeenCalledWith('/mk/login');
  });
});
