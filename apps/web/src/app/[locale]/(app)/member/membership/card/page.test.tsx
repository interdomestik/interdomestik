import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

import MemberCardPage from './page';

describe('MemberCardPage hotline disclaimer', () => {
  it('renders routing-only hotline copy on the membership card surface', async () => {
    const tree = await MemberCardPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expect(hoisted.getSessionSafeMock).toHaveBeenCalledWith('MemberMembershipCardPage');
    expect(screen.getByText('membership.card.hotline_disclaimer.title')).toBeInTheDocument();
    expect(screen.getByText('membership.card.hotline_disclaimer.body')).toBeInTheDocument();
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
