import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      name: 'Test Member',
      tenantId: 'tenant-ks',
      createdAt: new Date('2026-03-01T12:00:00.000Z'),
      memberNumber: 'ID-MEMBER',
    },
  })),
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn(),
  findFirstMock: vi.fn(async () => ({
    status: 'active',
    planId: 'asistenca',
    currentPeriodEnd: new Date('2027-03-01T12:00:00.000Z'),
  })),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
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

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
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

    expect(screen.getByText('membership.card.hotline_disclaimer.title')).toBeInTheDocument();
    expect(screen.getByText('membership.card.hotline_disclaimer.body')).toBeInTheDocument();
  });
});
