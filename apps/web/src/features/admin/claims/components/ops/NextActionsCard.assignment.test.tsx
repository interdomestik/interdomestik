import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimOpsDetail } from '../../types';
import { makeClaimOpsDetail as makeClaim } from '../detail/claim-ops-detail.test-fixture';
import { getNextActions } from '../detail/getNextActions';
import { NextActionsCard } from './NextActionsCard';

const mocks = vi.hoisted(() => ({
  assignOwner: vi.fn(),
  markSlaAcknowledged: vi.fn(),
  reload: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  messages: {
    'admin.claims_page.assignment.label': 'Assigned staff',
    'admin.claims_page.assignment.placeholder': 'Select staff',
    'admin.claims_page.assignment.success_message': 'Claim assigned successfully',
    'admin.claims_page.assignment.errors.target_denied':
      'This staff member cannot take this claim.',
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
const SARA_OPTION = 'Sara Staff (sara@example.test)';
const BEN_OPTION = 'Ben Staff (ben@example.test)';
const SAME_NAME_STAFF = [
  { id: 'staff-4', name: 'Alex Staff', email: 'alex.one@example.test' },
  { id: 'staff-5', name: 'Alex Staff', email: 'alex.two@example.test' },
];

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
  globalThis.sessionStorage.clear();
  vi.stubGlobal('location', { href: 'http://localhost/', reload: mocks.reload });
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

    await choose('Assigned staff', SARA_OPTION);

    // The gate proof waits for the full reload; the confirmation is carried across it.
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.assignOwner).toHaveBeenCalledTimes(1);
    expect(mocks.assignOwner).toHaveBeenCalledWith('claim-123', 'staff-2', 'en');
    expect(mocks.assignOwner).not.toHaveBeenCalledWith('claim-123', 'admin-1', 'en');
  });

  it('blocks duplicate activation while pending and allows retry after failure', async () => {
    let settle: (value: unknown) => void = () => undefined;
    mocks.assignOwner.mockReturnValueOnce(new Promise(resolve => (settle = resolve)));
    renderCard();
    const selector = screen.getByRole('combobox', { name: 'Assigned staff' });

    await choose('Assigned staff', SARA_OPTION);
    await waitFor(() => expect(selector).toBeDisabled());

    settle({ success: false, error: 'Staff member not found or out of scope' });
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('This staff member cannot take this claim.')
    );
    expect(mocks.reload).not.toHaveBeenCalled();
    await waitFor(() => expect(selector).toBeEnabled());

    await choose('Assigned staff', SARA_OPTION);
    await waitFor(() => expect(mocks.assignOwner).toHaveBeenCalledTimes(2));
  });

  it('reports unexpected failures truthfully', async () => {
    mocks.assignOwner.mockRejectedValueOnce(new Error('network'));
    renderCard();
    await choose('Assigned staff', BEN_OPTION);
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('An unexpected error occurred')
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('never shows unknown server text and falls back to the localized failure', async () => {
    mocks.assignOwner.mockResolvedValueOnce({ success: false, error: 'Action failed. Retry.' });
    renderCard();
    await choose('Assigned staff', BEN_OPTION);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Action failed'));
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('shows the localized confirmation once after the reload of the same claim', async () => {
    renderCard();
    await choose('Assigned staff', SARA_OPTION);
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));

    cleanup(); // the reloaded page mounts the card again
    renderCard({ claim: makeClaim({ id: 'claim-other' }) });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    cleanup();
    renderCard();
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Claim assigned successfully')
    );
    cleanup();
    renderCard();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows the confirmation before a delayed reload when session storage is blocked', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderCard();
      await choose('Assigned staff', SARA_OPTION);
      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith('Claim assigned successfully')
      );
      expect(mocks.reload).not.toHaveBeenCalled();
      // Mutation controls stay locked while the reload waits.
      expect(screen.getByTestId('ops-next-actions')).toHaveAttribute('aria-busy', 'true');
      await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1), { timeout: 4000 });
      expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    } finally {
      setItem.mockRestore();
    }
  });

  it('keeps SLA acknowledgement primary and offers secondary staff selection', async () => {
    const user = userEvent.setup();
    renderCard({ claim: makeClaim({ hasSlaBreach: true }) });

    await choose('Assigned staff', BEN_OPTION);
    await waitFor(() =>
      expect(mocks.assignOwner).toHaveBeenCalledWith('claim-123', 'staff-3', 'en')
    );

    // The assignment transition keeps the actions disabled until it settles.
    const acknowledge = screen.getByRole('button', { name: 'Acknowledge Breach' });
    await waitFor(() => expect(acknowledge).toBeEnabled());
    await user.click(acknowledge);
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

    await choose('Reassign', BEN_OPTION);
    await waitFor(() =>
      expect(mocks.assignOwner).toHaveBeenCalledWith('claim-123', 'staff-3', 'en')
    );
  });

  it('distinguishes same-name staff by email when assigning an unassigned case', async () => {
    renderCard({ staff: SAME_NAME_STAFF });

    await choose('Assigned staff', 'Alex Staff (alex.two@example.test)');

    await waitFor(() => expect(mocks.assignOwner).toHaveBeenCalledTimes(1));
    expect(mocks.assignOwner).toHaveBeenCalledWith('claim-123', 'staff-5', 'en');
  });

  it('distinguishes same-name staff by email when reassigning', async () => {
    renderCard({
      staff: SAME_NAME_STAFF,
      claim: makeClaim({ isUnassigned: false, assigneeId: 'staff-2' }),
    });

    await choose('Reassign', 'Alex Staff (alex.one@example.test)');

    await waitFor(() => expect(mocks.assignOwner).toHaveBeenCalledTimes(1));
    expect(mocks.assignOwner).toHaveBeenCalledWith('claim-123', 'staff-4', 'en');
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
