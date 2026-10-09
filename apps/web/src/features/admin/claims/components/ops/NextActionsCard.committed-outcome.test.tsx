import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en/admin-claims.json';
import mk from '@/messages/mk/admin-claims.json';
import sq from '@/messages/sq/admin-claims.json';
import sr from '@/messages/sr/admin-claims.json';
import { makeClaimOpsDetail as makeClaim } from '../detail/claim-ops-detail.test-fixture';
import type { NextActionsResult } from '../detail/getNextActions';
import { NextActionsCard } from './NextActionsCard';
// The global setup mocks next-intl; this file validates the real catalogs and key resolution.
vi.unmock('next-intl');
const mocks = vi.hoisted(() => ({
  assignOwner: vi.fn(),
  markSlaAcknowledged: vi.fn(),
  sendMemberReminder: vi.fn(),
  updateStatus: vi.fn(),
  reload: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
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
vi.mock('./NextActionBadges', () => ({ NextActionBadges: () => null }));
vi.mock('./OpsStatusUpdateModal', () => ({
  OpsStatusUpdateModal: (props: {
    onOpenChange: (open: boolean) => void;
    onCommittedRefreshPending: () => void;
  }) => (
    <button
      type="button"
      data-testid="mock-modal-committed"
      onClick={() => {
        props.onOpenChange(false);
        props.onCommittedRefreshPending();
      }}
    />
  ),
}));
const CATALOGS = { en, sq, mk, sr } as const;
const COPY = {
  en: [
    'Your change was saved. Refresh the page to see the latest state. Do not repeat this action.',
    'Refresh',
  ],
  sq: [
    'Ndryshimi u ruajt. Rifreskoni faqen për të parë gjendjen më të fundit. Mos e përsërisni këtë veprim.',
    'Rifresko',
  ],
  mk: [
    'Промената е зачувана. Освежете ја страницата за да ја видите најновата состојба. Не ја повторувајте акцијата.',
    'Освежи',
  ],
  sr: [
    'Promena je sačuvana. Osvežite stranicu da biste videli najnovije stanje. Ne ponavljajte akciju.',
    'Osveži',
  ],
} as const;
const SERVER_TEXT = 'Server says: Saved. Reload the page if the latest state is not shown.';
const COMMITTED = { success: true, message: SERVER_TEXT, refreshPending: true } as const;
const STATUS_LABELS = {
  claims: { status: { evaluation: 'Evaluation', verification: 'Verification' } },
};
const MUTATION_NAMES = ['Acknowledge Breach', 'Record reminder', 'Reopen Claim'];
const PRIMARY_CASES = [
  { type: 'ack_sla', name: 'Acknowledge Breach', action: mocks.markSlaAcknowledged },
  { type: 'message_poke', name: 'Record reminder', action: mocks.sendMemberReminder },
  { type: 'reopen', name: 'Reopen Claim', action: mocks.updateStatus },
] as const;
function actions(primary: string): NextActionsResult {
  return {
    primary: { type: primary },
    secondary: [{ type: 'update_status' }, { type: 'review_blockers' }],
    allowedTransitions: ['evaluation', 'verification'],
  } as unknown as NextActionsResult;
}
function renderCard(primary: string, locale: keyof typeof CATALOGS = 'en') {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ ...CATALOGS[locale], ...STATUS_LABELS }}
      onError={() => undefined}
    >
      <NextActionsCard
        claim={makeClaim({ isUnassigned: false, assigneeId: 'staff-2' })}
        nextActions={actions(primary)}
        locale={locale}
        currentUserId="admin-1"
        allStaff={[]}
        canAssign={false}
      />
      <div id="timeline-section" />
    </NextIntlClientProvider>
  );
}
function totalMutationCalls() {
  return [
    mocks.assignOwner,
    mocks.markSlaAcknowledged,
    mocks.sendMemberReminder,
    mocks.updateStatus,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
}
function expectMutationsSuppressed() {
  for (const name of MUTATION_NAMES) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review Blockers' })).toBeInTheDocument();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('location', { href: 'http://localhost/', reload: mocks.reload });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('NextActionsCard committed-write refresh-pending outcome', () => {
  it.each(PRIMARY_CASES)(
    'keeps the normal $type success toast and reload',
    async ({ type, name, action }) => {
      action.mockResolvedValue({ success: true });
      renderCard(type);
      await userEvent.setup().click(screen.getByRole('button', { name }));
      await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Action completed');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    }
  );
  it('never infers refresh-pending from the compatibility message text', async () => {
    mocks.sendMemberReminder.mockResolvedValue({
      success: true,
      message: 'Saved. Reload the page if the latest state is not shown.',
    });
    renderCard('message_poke');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record reminder' }));
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Action completed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('keeps a failure a failure with no warning, no reload and controls intact', async () => {
    mocks.markSlaAcknowledged.mockResolvedValue({
      success: false,
      error: 'Action failed. Please try again.',
    });
    renderCard('ack_sla');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Acknowledge Breach' }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Action failed. Please try again.')
    );
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Acknowledge Breach' })).toBeEnabled()
    );
  });

  it.each(PRIMARY_CASES)(
    'shows a persistent warning for a committed $type without reload, toast or repeat',
    async ({ type, name, action }) => {
      action.mockResolvedValue(COMMITTED);
      const user = userEvent.setup();
      renderCard(type);

      await user.click(screen.getByRole('button', { name }));

      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent(COPY.en[0]);
      expect(screen.queryByText(SERVER_TEXT)).not.toBeInTheDocument();
      expect(status).not.toHaveTextContent(SERVER_TEXT);
      expectMutationsSuppressed();
      await waitFor(() =>
        expect(screen.getByTestId('ops-next-actions')).toHaveAttribute('aria-busy', 'false')
      );
      expect(mocks.reload).not.toHaveBeenCalled();
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
      expect(mocks.toastError).not.toHaveBeenCalled();
      expect(totalMutationCalls()).toBe(1);

      await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Refresh' }));

      expect(mocks.reload).toHaveBeenCalledTimes(1);
      expect(totalMutationCalls()).toBe(1);
      expect(screen.getByRole('status')).toHaveTextContent(COPY.en[0]);
    }
  );

  it('keeps aria-busy true until the committed action settles, then false with the warning', async () => {
    let settle!: (value: unknown) => void;
    mocks.sendMemberReminder.mockReturnValue(
      new Promise(resolve => {
        settle = resolve;
      })
    );
    renderCard('message_poke');
    const panel = screen.getByTestId('ops-next-actions');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Record reminder' }));
    await waitFor(() => expect(panel).toHaveAttribute('aria-busy', 'true'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    settle(COMMITTED);

    expect(await screen.findByRole('status')).toHaveTextContent(COPY.en[0]);
    await waitFor(() => expect(panel).toHaveAttribute('aria-busy', 'false'));
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.sendMemberReminder).toHaveBeenCalledTimes(1);
  });

  it('handles a committed direct status change on the secondary status path', async () => {
    mocks.updateStatus.mockResolvedValue(COMMITTED);
    const user = userEvent.setup();
    renderCard('message_poke');

    await user.click(screen.getByRole('combobox', { name: 'Advance Status' }));
    const option = await screen.findByRole('option', { name: /^Evaluation$/ });
    await user.click(option);

    expect(await screen.findByRole('status')).toHaveTextContent(COPY.en[0]);
    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateStatus).toHaveBeenCalledWith('claim-123', 'evaluation', 'en');
    expectMutationsSuppressed();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
  });

  it('shows the warning when the mounted modal forwards a committed outcome', async () => {
    renderCard('message_poke');

    await userEvent.setup().click(screen.getByTestId('mock-modal-committed'));

    expect(await screen.findByRole('status')).toHaveTextContent(COPY.en[0]);
    expect(screen.queryByTestId('mock-modal-committed')).not.toBeInTheDocument();
    expectMutationsSuppressed();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(totalMutationCalls()).toBe(0);
  });

  it.each(['en', 'sq', 'mk', 'sr'] as const)(
    '%s resolves real catalog keys and renders the localized warning and refresh action',
    async locale => {
      const [message, refresh] = COPY[locale];
      const t = createTranslator({
        locale,
        messages: CATALOGS[locale],
        namespace: 'admin.claims_page.next_actions',
      });
      const tOps = createTranslator({
        locale,
        messages: CATALOGS[locale],
        namespace: 'admin.claims_page.ops_center',
      });
      expect(t('committed_refresh_pending')).toBe(message);
      expect(message).not.toContain('committed_refresh_pending');
      expect(tOps('refresh')).toBe(refresh);

      mocks.sendMemberReminder.mockResolvedValue(COMMITTED);
      renderCard('message_poke', locale);
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: t('actions.message_poke.label') }));

      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent(message);
      expect(status).not.toHaveTextContent(SERVER_TEXT);
      expect(within(status).getByRole('button', { name: refresh })).toBeInTheDocument();
      expect(mocks.sendMemberReminder).toHaveBeenCalledWith('claim-123', 'email', locale);
      expect(mocks.reload).not.toHaveBeenCalled();
    }
  );
});
