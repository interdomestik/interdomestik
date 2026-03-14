import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'manager-1',
      role: 'branch_manager',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
    },
  })),
  getStaffClaimsListMock: vi.fn(async () => []),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@interdomestik/domain-claims', () => ({
  ACTIONABLE_CLAIM_STATUSES: ['submitted', 'verification', 'evaluation', 'negotiation', 'court'],
  getStaffClaimsList: hoisted.getStaffClaimsListMock,
}));

vi.mock('@/components/dashboard/claims/claim-status-badge', () => ({
  ClaimStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="claim-status-badge">{status}</span>
  ),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

import StaffClaimsPage from './_core.entry';

describe('StaffClaimsPage', () => {
  beforeEach(() => {
    hoisted.getSessionMock.mockClear();
    hoisted.getStaffClaimsListMock.mockClear();
    hoisted.getStaffClaimsListMock.mockResolvedValue([]);
  });

  it('passes branch-aware search filters into the staff queue query', async () => {
    const tree = await StaffClaimsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        assigned: 'unassigned',
        search: 'Acme',
        status: 'verification',
      }),
    });

    render(tree);

    expect(hoisted.getStaffClaimsListMock).toHaveBeenCalledWith({
      assignment: 'unassigned',
      branchId: 'branch-1',
      limit: 20,
      search: 'Acme',
      staffId: 'manager-1',
      status: 'verification',
      tenantId: 'tenant-ks',
    });
    expect(screen.getByTestId('staff-page-ready')).toBeInTheDocument();
  });
});
