import React from 'react';
import { vi } from 'vitest';

export function createStaffHandoffMocks() {
  return {
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
  };
}

export type StaffHandoffMocks = ReturnType<typeof createStaffHandoffMocks>;

export const routingMock = {
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
};

export function createDatabaseMock(mocks: StaffHandoffMocks) {
  const db = {
    query: {
      user: {
        findFirst: mocks.findStaffBranch,
        findMany: mocks.findManyStaff,
      },
    },
  };
  return {
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    db,
    withTenantContext: async (_context: unknown, callback: (tx: typeof db) => unknown) =>
      callback(db),
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    user: {
      branchId: 'user.branch_id',
      email: 'user.email',
      id: 'user.id',
      name: 'user.name',
      role: 'user.role',
      tenantId: 'user.tenant_id',
    },
  };
}

export const uiMock = {
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
};

export const queueItem = {
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
  needsFollowUp: false,
  publicResponseAt: null,
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

export function session(role: 'staff' | 'branch_manager' = 'staff') {
  return {
    user: {
      branchId: 'branch-1',
      id: role === 'staff' ? 'staff-1' : 'manager-1',
      role,
      tenantId: 'tenant-1',
    },
  };
}

export function applyDefaultMocks(mocks: StaffHandoffMocks) {
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
