import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acceptSupportHandoff: vi.fn(),
  closeSupportHandoff: vi.fn(),
  findStaffBranch: vi.fn(),
  findManyStaff: vi.fn(),
  getQueue: vi.fn(),
  getSessionSafe: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
  reassignSupportHandoff: vi.fn(),
  requireSessionOrRedirect: vi.fn(session => session),
  setRequestLocale: vi.fn(),
}));

vi.mock('@/actions/support-handoffs/lifecycle', () => ({
  acceptSupportHandoff: mocks.acceptSupportHandoff,
  closeSupportHandoff: mocks.closeSupportHandoff,
  reassignSupportHandoff: mocks.reassignSupportHandoff,
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
}));

import StaffSupportHandoffsPage from './_core.entry';

const queueItem = {
  claim: {
    claimNumber: 'CLM-1',
    id: 'claim-1',
    status: 'submitted',
    title: 'Claim one',
  },
  createdAt: '2026-05-03T10:00:00.000Z',
  id: 'handoff-1',
  lifecycleVersion: 4,
  member: {
    email: 'member@example.com',
    id: 'member-1',
    memberNumber: 'MEM-1',
    name: 'Member One',
  },
  message: 'The member needs staff support.',
  relationship: {
    agentName: 'Agent One',
    branchName: 'Prishtina',
    membershipStatus: 'active',
    planName: 'Family',
  },
  staffId: null,
  staffName: null,
  status: 'open',
  subject: 'Help with submitted claim',
  trustRisk: 'high',
  updatedAt: '2026-05-03T10:00:00.000Z',
  urgency: 'critical',
} as const;

function session(role: 'staff' | 'branch_manager' = 'staff') {
  return {
    user: {
      branchId: 'branch-1',
      id: role === 'staff' ? 'staff-1' : 'manager-1',
      role,
      tenantId: 'tenant-1',
    },
  };
}

async function renderPage() {
  const tree = await StaffSupportHandoffsPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
  });
  render(tree);
}

describe('StaffSupportHandoffsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionSafe.mockResolvedValue(session('staff'));
    mocks.requireSessionOrRedirect.mockImplementation(currentSession => currentSession);
    mocks.getQueue.mockResolvedValue([queueItem]);
    mocks.findStaffBranch.mockResolvedValue({ branchId: 'branch-1' });
    mocks.findManyStaff.mockResolvedValue([
      { email: 'staff@example.com', id: 'staff-1', name: 'Staff One', role: 'staff' },
      { email: 'staff2@example.com', id: 'staff-2', name: 'Staff Two', role: 'staff' },
    ]);
  });

  it('renders the staff receiving queue with optimistic accept controls', async () => {
    await renderPage();

    expect(screen.getByTestId('staff-page-ready')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoffs-queue')).toBeVisible();
    expect(screen.getByText('Help with submitted claim')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-accept-form')).toBeVisible();
    expect(screen.getByDisplayValue('4')).toHaveAttribute('name', 'expectedVersion');
    expect(screen.queryByTestId('staff-support-handoff-readonly')).not.toBeInTheDocument();
  });

  it('shows reassignment only for accepted handoffs owned by the current staff member', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);

    await renderPage();

    expect(screen.getByTestId('staff-support-handoff-reassign-form')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-close-form')).toBeVisible();
  });

  it('hides reassignment for accepted handoffs owned by another staff member', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        staffId: 'staff-2',
        staffName: 'Staff Two',
        status: 'accepted',
      },
    ]);

    await renderPage();

    expect(screen.queryByTestId('staff-support-handoff-reassign-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-support-handoff-close-form')).not.toBeInTheDocument();
  });

  it('renders branch manager access as read-only while keeping branch scope', async () => {
    mocks.getSessionSafe.mockResolvedValue(session('branch_manager'));

    await renderPage();

    expect(screen.getByTestId('staff-support-handoffs-readonly-notice')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-readonly')).toBeVisible();
    expect(screen.queryByTestId('staff-support-handoff-accept-form')).not.toBeInTheDocument();
    expect(mocks.getQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-1',
        viewerRole: 'branch_manager',
      })
    );
    expect(mocks.findManyStaff).not.toHaveBeenCalled();
  });

  it('fails closed when staff support queue has no branch scope', async () => {
    mocks.getSessionSafe.mockResolvedValue({
      user: {
        branchId: null,
        id: 'staff-1',
        role: 'staff',
        tenantId: 'tenant-1',
      },
    });
    mocks.findStaffBranch.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(mocks.getQueue).not.toHaveBeenCalled();
  });
});
