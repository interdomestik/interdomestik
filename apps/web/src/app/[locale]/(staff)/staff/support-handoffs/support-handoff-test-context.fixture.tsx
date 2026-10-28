import { render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acceptSupportHandoff: vi.fn(),
  closeSupportHandoff: vi.fn(),
  findStaffBranch: vi.fn(),
  findManyStaff: vi.fn(),
  getQueue: vi.fn(),
  getSessionSafe: vi.fn(),
  getSupportHandoffDetail: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
  reassignSupportHandoff: vi.fn(),
  requireSessionOrRedirect: vi.fn(session => session),
  routerRefresh: vi.fn(),
  setRequestLocale: vi.fn(),
  updateSupportHandoffPublicResponse: vi.fn(),
}));

vi.mock('@/actions/support-handoffs/lifecycle', () => ({
  acceptSupportHandoff: mocks.acceptSupportHandoff,
  closeSupportHandoff: mocks.closeSupportHandoff,
  reassignSupportHandoff: mocks.reassignSupportHandoff,
}));

vi.mock('@/actions/support-handoffs/detail', () => ({
  getSupportHandoffDetail: mocks.getSupportHandoffDetail,
}));

vi.mock('@/actions/support-handoffs/response', () => ({
  updateSupportHandoffPublicResponse: mocks.updateSupportHandoffPublicResponse,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: mocks.getSessionSafe,
  requireSessionOrRedirect: mocks.requireSessionOrRedirect,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: vi.fn(async (_context, action) =>
    action({ query: { user: { findFirst: mocks.findStaffBranch, findMany: mocks.findManyStaff } } })
  ),
  and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
  db: {
    query: {
      user: {
        findFirst: mocks.findStaffBranch,
        findMany: mocks.findManyStaff,
      },
    },
  },
  eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
  user: {
    branchId: 'user.branch_id',
    email: 'user.email',
    id: 'user.id',
    name: 'user.name',
    role: 'user.role',
    tenantId: 'user.tenant_id',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/queue', () => ({
  getStaffSupportHandoffQueue: mocks.getQueue,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: mocks.setRequestLocale,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({
    refresh: mocks.routerRefresh,
  }),
}));

import StaffSupportHandoffsPage from './_core.entry';

import { queueItem, session } from './support-handoff-page.fixture';

export async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const tree = await StaffSupportHandoffsPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });
  render(tree);
}

export function setupPageMocks() {
  vi.clearAllMocks();
  mocks.getSessionSafe.mockResolvedValue(session('staff'));
  mocks.requireSessionOrRedirect.mockImplementation(currentSession => currentSession);
  mocks.getQueue.mockResolvedValue([queueItem]);
  mocks.getSupportHandoffDetail.mockResolvedValue({
    acceptedAt: null,
    acceptedByName: null,
    closedAt: null,
    closedByName: null,
    closeReason: null,
    contactPreference: 'phone',
    memberReply: {
      memberReply: null,
      memberReplyAt: null,
      memberReplyResponseVersion: null,
    },
    publicResponse: {
      publicResponse: null,
      publicResponseAt: null,
      publicResponseVersion: 0,
    },
    reassignedAt: null,
    reassignedByName: null,
    reassignReason: null,
    source: 'member_help',
  });
  mocks.findStaffBranch.mockResolvedValue({ branchId: 'branch-1' });
  mocks.findManyStaff.mockResolvedValue([
    { email: 'staff@example.com', id: 'staff-1', name: 'Staff One', role: 'staff' },
    { email: 'staff2@example.com', id: 'staff-2', name: 'Staff Two', role: 'staff' },
  ]);
  mocks.updateSupportHandoffPublicResponse.mockResolvedValue(undefined);
}

export const pageMocks = mocks;
