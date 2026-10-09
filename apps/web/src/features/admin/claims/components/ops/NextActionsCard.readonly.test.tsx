import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeClaimOpsDetail as makeClaim } from '../detail/claim-ops-detail.test-fixture';
import type { NextActionsResult } from '../detail/getNextActions';
import { NextActionsCard } from './NextActionsCard';

const mocks = vi.hoisted(() => ({
  assignOwner: vi.fn(),
  markSlaAcknowledged: vi.fn(),
  scrollIntoView: vi.fn(),
  sendMemberReminder: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateStatus: vi.fn(),
  messages: {
    'admin.claims_page.assignment.label': 'Assigned staff',
    'admin.claims_page.assignment.placeholder': 'Select staff',
    'admin.claims_page.next_actions.no_action': 'No action required',
    'admin.claims_page.next_actions.actions.ack_sla.label': 'Acknowledge Breach',
    'admin.claims_page.next_actions.actions.message_poke.label': 'Remind Member',
    'admin.claims_page.next_actions.actions.reopen.label': 'Reopen',
    'admin.claims_page.next_actions.actions.reassign.label': 'Reassign',
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
  sendMemberReminder: mocks.sendMemberReminder,
  updateStatus: mocks.updateStatus,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock('@/components/ops', () => ({
  OpsActionBar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('./NextActionBadges', () => ({
  NextActionBadges: () => <div data-testid="next-action-badges" />,
}));
vi.mock('./OpsStatusUpdateModal', () => ({
  OpsStatusUpdateModal: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="status-modal" data-open={String(isOpen)} />
  ),
}));
vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      mocks.messages[`${namespace}.${key}`] ?? `${namespace}.${key}`,
}));

const STAFF = [{ id: 'staff-3', name: 'Ben Staff', email: 'ben@example.test' }];
const MUTATION_BUTTONS = ['Remind Member', 'Acknowledge Breach', 'Reopen'];
const MUTATION_SELECTS = ['Advance Status', 'Reassign', 'Assigned staff'];

// Every action type the card can surface; only review_blockers is navigation-only.
function everyAction(): NextActionsResult {
  return {
    primary: { type: 'message_poke' },
    secondary: [
      { type: 'ack_sla' },
      { type: 'reopen' },
      { type: 'update_status' },
      { type: 'reassign' },
      { type: 'assign' },
      { type: 'review_blockers' },
    ],
    allowedTransitions: ['evaluation', 'verification'],
  } as unknown as NextActionsResult;
}

function renderCard(
  options: { readOnly?: boolean; canAssign?: boolean; nextActions?: NextActionsResult } = {}
) {
  render(
    <>
      <NextActionsCard
        claim={makeClaim({ hasSlaBreach: true, isUnassigned: false, assigneeId: 'staff-2' })}
        nextActions={options.nextActions ?? everyAction()}
        locale="en"
        currentUserId="admin-1"
        allStaff={STAFF}
        canAssign={options.canAssign ?? true}
        readOnly={options.readOnly}
      />
      <div id="timeline-section" />
    </>
  );
}

function expectNoMutationCalls() {
  expect(mocks.assignOwner).not.toHaveBeenCalled();
  expect(mocks.markSlaAcknowledged).not.toHaveBeenCalled();
  expect(mocks.sendMemberReminder).not.toHaveBeenCalled();
  expect(mocks.updateStatus).not.toHaveBeenCalled();
}

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: mocks.scrollIntoView,
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
  mocks.sendMemberReminder.mockResolvedValue({ success: false, error: 'Rate limited.' });
});

describe('NextActionsCard explicit read-only presentation', () => {
  it('keeps badges and review-blocker navigation but renders no mutation control', () => {
    renderCard({ readOnly: true });

    expect(screen.getByTestId('ops-next-actions')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByTestId('next-action-badges')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Blockers' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    for (const name of MUTATION_BUTTONS) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    for (const name of MUTATION_SELECTS) {
      expect(screen.queryByRole('combobox', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId('status-modal')).not.toBeInTheDocument();
  });

  it('lets pointer and keyboard use review-blocker navigation without action calls', async () => {
    const user = userEvent.setup();
    renderCard({ readOnly: true });
    const reviewBlockers = screen.getByRole('button', { name: 'Review Blockers' });

    await user.click(reviewBlockers);
    reviewBlockers.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    await waitFor(() => expect(mocks.scrollIntoView).toHaveBeenCalledTimes(3));
    expectNoMutationCalls();
  });

  it('stays visible for an SLA breach with only mutating actions, offering none', () => {
    renderCard({
      readOnly: true,
      nextActions: {
        primary: { type: 'ack_sla' },
        secondary: [],
        allowedTransitions: ['evaluation'],
      } as unknown as NextActionsResult,
    });

    expect(screen.getByTestId('next-action-badges')).toBeInTheDocument();
    expect(screen.getByText('No action required')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('exposes pending until the actual reminder action settles', async () => {
    let settle!: (value: { success: false; error: string }) => void;
    mocks.sendMemberReminder.mockReturnValue(
      new Promise(resolve => {
        settle = resolve;
      })
    );
    renderCard({ readOnly: false });
    const panel = screen.getByTestId('ops-next-actions');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remind Member' }));
    await waitFor(() => expect(panel).toHaveAttribute('aria-busy', 'true'));
    settle({ success: false, error: 'Rate limited.' });
    await waitFor(() => expect(panel).toHaveAttribute('aria-busy', 'false'));
    expect(mocks.sendMemberReminder).toHaveBeenCalledTimes(1);
  });

  it('distinguishes canAssign=false (status and reminder kept) from read-only', async () => {
    const user = userEvent.setup();
    renderCard({ canAssign: false, readOnly: false });

    expect(screen.queryByRole('combobox', { name: 'Reassign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Assigned staff' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Advance Status' })).toBeInTheDocument();
    expect(screen.getByTestId('status-modal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remind Member' }));
    await waitFor(() =>
      expect(mocks.sendMemberReminder).toHaveBeenCalledWith('claim-123', 'email', 'en')
    );
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Rate limited.'));
  });
});
