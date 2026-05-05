import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    mocks.getSupportHandoffDetail.mockResolvedValue({
      acceptedAt: null,
      acceptedByName: null,
      closedAt: null,
      closedByName: null,
      closeReason: null,
      contactPreference: 'phone',
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

  it('loads and renders detail context on demand for staff', async () => {
    await renderPage();

    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    await waitFor(() => {
      expect(mocks.getSupportHandoffDetail).toHaveBeenCalledWith('handoff-1');
    });
    expect(await screen.findByTestId('staff-support-handoff-detail-panel')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-contact-preference')).toHaveTextContent(
      'detail.contact_preference_phone'
    );
    expect(screen.getByTestId('staff-support-handoff-source')).toHaveTextContent(
      'detail.source_member_help'
    );
    expect(screen.getByTestId('staff-support-handoff-full-message')).toHaveTextContent(
      'The member needs staff support.'
    );
    expect(screen.getByTestId('staff-support-handoff-lifecycle-created')).toHaveTextContent(
      'detail.lifecycle_created'
    );
  });

  it('renders claim-detail source labels in the expanded detail panel', async () => {
    mocks.getSupportHandoffDetail.mockResolvedValueOnce({
      acceptedAt: null,
      acceptedByName: null,
      closedAt: null,
      closedByName: null,
      closeReason: null,
      contactPreference: 'staff_reply',
      publicResponse: {
        publicResponse: null,
        publicResponseAt: null,
        publicResponseVersion: 0,
      },
      reassignedAt: null,
      reassignedByName: null,
      reassignReason: null,
      source: 'member_claim_detail',
    });

    await renderPage();

    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    expect(await screen.findByTestId('staff-support-handoff-source')).toHaveTextContent(
      'detail.source_claim_detail'
    );
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

  it('shows a public response badge when a member-visible update exists', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        publicResponseAt: '2026-05-04T11:00:00.000Z',
      },
    ]);

    await renderPage();

    expect(screen.getByTestId('staff-support-handoff-public-response-badge')).toHaveTextContent(
      'table.public_response_sent'
    );
  });

  it('renders the public response form for the assigned staff owner on accepted handoffs', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);
    mocks.getSupportHandoffDetail.mockResolvedValueOnce({
      acceptedAt: '2026-05-04T08:30:00.000Z',
      acceptedByName: 'Staff One',
      closedAt: null,
      closedByName: null,
      closeReason: null,
      contactPreference: 'phone',
      publicResponse: {
        publicResponse: 'Existing member-visible update',
        publicResponseAt: '2026-05-04T11:00:00.000Z',
        publicResponseVersion: 3,
      },
      reassignedAt: null,
      reassignedByName: null,
      reassignReason: null,
      source: 'member_help',
    });

    await renderPage();
    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    expect(await screen.findByTestId('staff-support-handoff-public-response-form')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-public-response-input')).toHaveValue(
      'Existing member-visible update'
    );
    expect(screen.getByDisplayValue('3')).toHaveAttribute('name', 'expectedVersion');
    expect(screen.getByTestId('staff-support-handoff-public-response-submit')).toHaveTextContent(
      'detail.public_response_update'
    );
    expect(
      screen.getByTestId('staff-support-handoff-public-response-awaiting-acknowledgement')
    ).toHaveTextContent('detail.public_response_awaiting_acknowledgement');
  });

  it('renders read-only acknowledgement status for the current public response', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        publicResponseAt: '2026-05-04T11:00:00.000Z',
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);
    mocks.getSupportHandoffDetail.mockResolvedValueOnce({
      acceptedAt: '2026-05-04T08:30:00.000Z',
      acceptedByName: 'Staff One',
      closedAt: null,
      closedByName: null,
      closeReason: null,
      contactPreference: 'phone',
      publicResponse: {
        publicResponse: 'Existing member-visible update',
        publicResponseAt: '2026-05-04T11:00:00.000Z',
        publicResponseAcknowledged: true,
        publicResponseAcknowledgedAt: '2026-05-04T11:05:00.000Z',
        publicResponseAcknowledgedVersion: 3,
        publicResponseVersion: 3,
      },
      reassignedAt: null,
      reassignedByName: null,
      reassignReason: null,
      source: 'member_help',
    });

    await renderPage();
    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    expect(
      await screen.findByTestId('staff-support-handoff-public-response-acknowledged')
    ).toHaveTextContent('detail.public_response_acknowledged_at');
  });

  it('refreshes public response detail after the assigned staff owner submits an update', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);
    mocks.getSupportHandoffDetail
      .mockResolvedValueOnce({
        acceptedAt: '2026-05-04T08:30:00.000Z',
        acceptedByName: 'Staff One',
        closedAt: null,
        closedByName: null,
        closeReason: null,
        contactPreference: 'phone',
        publicResponse: {
          publicResponse: 'Existing member-visible update',
          publicResponseAt: '2026-05-04T11:00:00.000Z',
          publicResponseVersion: 3,
        },
        reassignedAt: null,
        reassignedByName: null,
        reassignReason: null,
        source: 'member_help',
      })
      .mockResolvedValueOnce({
        acceptedAt: '2026-05-04T08:30:00.000Z',
        acceptedByName: 'Staff One',
        closedAt: null,
        closedByName: null,
        closeReason: null,
        contactPreference: 'phone',
        publicResponse: {
          publicResponse: 'Updated member-visible response',
          publicResponseAt: '2026-05-04T12:00:00.000Z',
          publicResponseVersion: 4,
        },
        reassignedAt: null,
        reassignedByName: null,
        reassignReason: null,
        source: 'member_help',
      });

    await renderPage();
    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    const input = await screen.findByTestId('staff-support-handoff-public-response-input');
    fireEvent.change(input, { target: { value: 'Updated member-visible response' } });
    fireEvent.submit(screen.getByTestId('staff-support-handoff-public-response-form'));

    await waitFor(() => {
      expect(mocks.updateSupportHandoffPublicResponse).toHaveBeenCalled();
      expect(mocks.getSupportHandoffDetail).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId('staff-support-handoff-public-response-input')).toHaveValue(
      'Updated member-visible response'
    );
    const refreshedForm = screen.getByTestId('staff-support-handoff-public-response-form');
    expect(refreshedForm.querySelector('input[name="expectedVersion"]')).toHaveValue('4');
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
    expect(screen.getByTestId('staff-support-handoff-detail-toggle')).toBeVisible();
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
