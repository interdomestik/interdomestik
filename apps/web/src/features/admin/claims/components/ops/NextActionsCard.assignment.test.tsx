import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimOpsDetail } from '../../types';
import { getNextActions } from '../detail/getNextActions';
import { NextActionsCard } from './NextActionsCard';

const mocks = vi.hoisted(() => ({
  assignOwner: vi.fn(),
  markSlaAcknowledged: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  messages: {
    'admin.claims_page.assignment.label': 'Assigned staff',
    'admin.claims_page.assignment.placeholder': 'Select staff',
    'admin.claims_page.next_actions.actions.assign.label': 'Assign to Me',
    'admin.claims_page.next_actions.actions.reassign.label': 'Reassign',
    'admin.claims_page.next_actions.actions.ack_sla.label': 'Acknowledge Breach',
    'admin.claims_page.next_actions.actions.review_blockers.label': 'Review Blockers',
    'admin.claims_page.next_actions.actions.update_status.label': 'Advance Status',
    'admin.claims_page.next_actions.toast.failed': 'Action failed',
    'admin.claims_page.next_actions.toast.completed': 'Action completed',
    'admin.claims_page.next_actions.toast.unexpected_error': 'An unexpected error occurred',
  } as Record<string, string>,
}));

vi.mock('../../actions/ops-actions', () => ({
  assignOwner: mocks.assignOwner,
  markSlaAcknowledged: mocks.markSlaAcknowledged,
  sendMemberReminder: vi.fn(),
  updateStatus: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock('@/components/ops', () => ({
  OpsActionBar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('./NextActionBadges', () => ({ NextActionBadges: () => null }));
vi.mock('./OpsStatusUpdateModal', () => ({ OpsStatusUpdateModal: () => null }));
vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      mocks.messages[`${namespace}.${key}`] ?? `${namespace}.${key}`,
}));

const STAFF = [
  { id: 'staff-2', name: 'Sara Staff', email: 'sara@example.test' },
  { id: 'staff-3', name: 'Ben Staff', email: 'ben@example.test' },
];

function makeClaim(overrides: Partial<ClaimOpsDetail> = {}): ClaimOpsDetail {
  return {
    id: 'claim-123',
    code: 'CLAIM-123',
    claimNumber: 'CLM-XK-KS01-2026-000001',
    title: 'Test Claim',
    lifecycleStage: 'processing',
    stageStartedAt: new Date(),
    daysInStage: 2,
    ownerRole: 'staff',
    ownerName: null,
    assigneeId: null,
    isStuck: false,
    hasSlaBreach: false,
    isUnassigned: true,
    waitingOn: 'staff',
    hasCashPending: false,
    memberId: 'member-123',
    memberName: 'John Doe',
    memberEmail: 'john@example.com',
    branchCode: 'B01',
    agentName: null,
    category: 'auto',
    status: 'evaluation',
    description: 'Desc',
    docs: [],
    companyName: 'Acme Corp',
    claimAmount: '1000',
    currency: 'EUR',
    createdAt: new Date(),
    originType: 'portal',
    originRefId: null,
    originDisplayName: null,
    memberNumber: 'MEM-2026-0001',
    ...overrides,
  };
}

function renderCard(
  options: { claim?: ClaimOpsDetail; canAssign?: boolean; staff?: typeof STAFF } = {}
) {
  const claim = options.claim ?? makeClaim();
  render(
    <NextActionsCard
      claim={claim}
      nextActions={getNextActions(claim, 'admin-1')}
      locale="en"
      currentUserId="admin-1"
      allStaff={options.staff ?? STAFF}
      canAssign={options.canAssign ?? true}
    />
  );
}

async function choose(comboboxName: string, optionName: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: comboboxName }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
  if (!('ResizeObserver' in globalThis)) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assignOwner.mockResolvedValue({ success: true });
  mocks.markSlaAcknowledged.mockResolvedValue({ success: true });
});

describe('NextActionsCard staff assignment', () => {
  it('assigns an unassigned case only to the explicitly chosen staff member', async () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Assign to Me' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Assigned staff' })).toHaveTextContent(
      'Select staff'
    );
    expect(mocks.assignOwner).not.toHaveBeenCalled();

    await choose('Assigned staff', 'Sara Staff');

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Action completed'));
    expect(mocks.assignOwner).toHaveBeenCalledTimes(1);
    expect(mocks.assignOwner).toHaveBeenCalledWith('claim-123', 'staff-2', 'en');
    expect(mocks.assignOwner).not.toHaveBeenCalledWith('claim-123', 'admin-1', 'en');
  });

  it('blocks duplicate activation while pending and allows retry after failure', async () => {
    let settle: (value: unknown) => void = () => undefined;
    mocks.assignOwner.mockReturnValueOnce(new Promise(resolve => (settle = resolve)));
    renderCard();
    const selector = screen.getByRole('combobox', { name: 'Assigned staff' });

    await choose('Assigned staff', 'Sara Staff');
    await waitFor(() => expect(selector).toBeDisabled());

    settle({ success: false, error: 'Staff member not found or out of scope' });
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Staff member not found or out of scope')
    );
    await waitFor(() => expect(selector).toBeEnabled());

    await choose('Assigned staff', 'Sara Staff');
    await waitFor(() => expect(mocks.assignOwner).toHaveBeenCalledTimes(2));
  });

  it('reports unexpected failures truthfully', async () => {
    mocks.assignOwner.mockRejectedValueOnce(new Error('network'));
    renderCard();
    await choose('Assigned staff', 'Ben Staff');
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('An unexpected error occurred')
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('keeps SLA acknowledgement primary and offers secondary staff selection', async () => {
    const user = userEvent.setup();
    renderCard({ claim: makeClaim({ hasSlaBreach: true }) });

    await choose('Assigned staff', 'Ben Staff');
    await waitFor(() =>
      expect(mocks.assignOwner).toHaveBeenCalledWith('claim-123', 'staff-3', 'en')
    );

    await user.click(screen.getByRole('button', { name: 'Acknowledge Breach' }));
    await waitFor(() => expect(mocks.markSlaAcknowledged).toHaveBeenCalledWith('claim-123', 'en'));
  });

  it('offers secondary staff selection for stuck unassigned cases', () => {
    renderCard({ claim: makeClaim({ isStuck: true }) });
    expect(screen.getByRole('button', { name: 'Review Blockers' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Assigned staff' })).toBeEnabled();
  });

  it('preserves reassign for assigned cases', async () => {
    renderCard({ claim: makeClaim({ isUnassigned: false, assigneeId: 'staff-2' }) });
    expect(screen.queryByRole('combobox', { name: 'Assigned staff' })).not.toBeInTheDocument();

    await choose('Reassign', 'Ben Staff');
    await waitFor(() =>
      expect(mocks.assignOwner).toHaveBeenCalledWith('claim-123', 'staff-3', 'en')
    );
  });

  it('renders no actionable assignment control when the actor cannot assign', () => {
    renderCard({ canAssign: false });
    expect(screen.queryByRole('combobox', { name: 'Assigned staff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign to Me' })).not.toBeInTheDocument();
  });

  it('hides reassign but keeps status update when the actor cannot assign', () => {
    renderCard({
      canAssign: false,
      claim: makeClaim({ isUnassigned: false, assigneeId: 'staff-2' }),
    });
    expect(screen.queryByRole('combobox', { name: 'Reassign' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Advance Status' })).toBeInTheDocument();
  });

  it('never offers a self action when no eligible staff exist', () => {
    renderCard({ staff: [] });
    expect(screen.getByRole('combobox', { name: 'Assigned staff' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Assign to Me' })).not.toBeInTheDocument();
    expect(mocks.assignOwner).not.toHaveBeenCalled();
  });
});
