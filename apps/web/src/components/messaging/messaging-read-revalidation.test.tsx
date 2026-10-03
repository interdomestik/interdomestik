import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The global test setup replaces next-intl with a key-echoing mock that has no
// NextIntlClientProvider. This suite composes the shipped catalogs for real, so it opts back into
// the real module exactly as the other real-catalog suites do.
vi.unmock('next-intl');

vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn(),
  markMessagesAsRead: vi.fn(),
}));

import { getMessagesForClaim, markMessagesAsRead } from '@/actions/messages';
import { NextIntlClientProvider } from 'next-intl';
import { MessagingPanel } from './messaging-panel';
import {
  type PanelProps,
  STAFF_USER,
  buildMessage,
  catalogs,
  copy,
  deferred,
  renderPanel,
} from './messaging-read-test-support';

type ReadResult = Awaited<ReturnType<typeof getMessagesForClaim>>;
type ReceiptResult = Awaited<ReturnType<typeof markMessagesAsRead>>;

interface ReceiptGate {
  readonly promise: Promise<ReceiptResult>;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: ReceiptResult) => void;
}

const read = vi.mocked(getMessagesForClaim);
const receipt = vi.mocked(markMessagesAsRead);

// Same claim, same user, same role: every re-render below keeps the panel's scope key, so a server
// re-render must reconcile in place instead of remounting the conversation.
const SAME_SCOPE: PanelProps = {
  claimId: 'claim-1',
  currentUser: STAFF_USER,
  fetchOnMount: false,
};
const DRAFT_TEXT = 'Draft that must survive a server re-render';

function typeDraft() {
  fireEvent.change(screen.getByTestId('message-input'), { target: { value: DRAFT_TEXT } });
}

// The shared helper renders without StrictMode, so the cleanup/setup guard composes the same real
// catalogs and the same real panel here instead of faking the hook.
function renderStrictPanel(props: PanelProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={catalogs.en} timeZone="UTC">
      <MessagingPanel {...props} />
    </NextIntlClientProvider>,
    { wrapper: StrictMode }
  );
}

describe('staff message server re-render revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    receipt.mockResolvedValue({ success: true });
    read.mockResolvedValue({ success: true, messages: [] });
  });

  it('adopts a successful server re-render after a failed one', async () => {
    const { rerenderPanel } = renderPanel({ ...SAME_SCOPE, initialReadFailed: true });

    expect(await screen.findByTestId('messaging-read-error')).toHaveTextContent(
      copy.read.loadError
    );
    typeDraft();

    const reseeded = [buildMessage({ id: 'msg-reseed', content: 'Reseeded server history' })];
    rerenderPanel({ ...SAME_SCOPE, initialMessages: reseeded, initialReadFailed: false });

    expect(screen.getByText('Reseeded server history')).toBeInTheDocument();
    expect(screen.queryByTestId('messaging-read-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-input')).toHaveValue(DRAFT_TEXT);
    await waitFor(() => expect(receipt).toHaveBeenCalledWith(['msg-reseed']));
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps the last successful history and draft when a re-render failed', async () => {
    const seeded = [buildMessage({ id: 'msg-seed', content: 'Seeded server history' })];
    const { rerenderPanel } = renderPanel({ ...SAME_SCOPE, initialMessages: seeded });

    await waitFor(() => expect(receipt).toHaveBeenCalledWith(['msg-seed']));
    typeDraft();

    rerenderPanel({ ...SAME_SCOPE, initialMessages: [], initialReadFailed: true });

    expect(await screen.findByTestId('messaging-read-error')).toHaveTextContent(
      copy.read.loadError
    );
    expect(screen.getByText('Seeded server history')).toBeInTheDocument();
    expect(screen.queryByTestId('messaging-empty-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-input')).toHaveValue(DRAFT_TEXT);
    expect(read).not.toHaveBeenCalled();
    expect(receipt).toHaveBeenCalledTimes(1);
  });

  it('ignores a client read that a fresh server re-render superseded', async () => {
    const seeded = [buildMessage({ id: 'msg-seed', content: 'Seeded server history' })];
    const pendingRead = deferred<ReadResult>();
    read.mockReturnValueOnce(pendingRead.promise);

    const { rerenderPanel } = renderPanel({ ...SAME_SCOPE, initialMessages: seeded });
    await waitFor(() => expect(receipt).toHaveBeenCalledWith(['msg-seed']));

    fireEvent.click(screen.getByTestId('messaging-refresh'));
    await waitFor(() => expect(read).toHaveBeenCalledWith('claim-1'));

    const reseeded = [buildMessage({ id: 'msg-reseed', content: 'Reseeded server history' })];
    rerenderPanel({ ...SAME_SCOPE, initialMessages: reseeded });

    expect(screen.getByText('Reseeded server history')).toBeInTheDocument();
    await waitFor(() => expect(receipt).toHaveBeenCalledWith(['msg-reseed']));

    await act(async () => {
      pendingRead.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-stale', content: 'Stale client history' })],
      });
    });

    // The late read neither replaces the adopted seed nor starts a receipt of its own.
    expect(screen.queryByText('Stale client history')).not.toBeInTheDocument();
    expect(screen.getByText('Reseeded server history')).toBeInTheDocument();
    expect(receipt).not.toHaveBeenCalledWith(['msg-stale']);
    expect(receipt).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByTestId('messaging-panel')).toHaveAttribute('aria-busy', 'false')
    );
  });

  it('drops the status of a receipt that a newer server re-render superseded', async () => {
    const staleReceipt = deferred<ReceiptResult>();
    receipt.mockReturnValueOnce(staleReceipt.promise);

    const seeded = [buildMessage({ id: 'msg-seed', content: 'Seeded server history' })];
    const { rerenderPanel } = renderPanel({ ...SAME_SCOPE, initialMessages: seeded });
    await waitFor(() => expect(receipt).toHaveBeenCalledWith(['msg-seed']));

    const reseeded = [buildMessage({ id: 'msg-reseed', content: 'Reseeded server history' })];
    rerenderPanel({ ...SAME_SCOPE, initialMessages: reseeded });
    await waitFor(() => expect(receipt).toHaveBeenCalledWith(['msg-reseed']));

    // That receipt was already sent and is not claimed to be cancelled; only the status it reports
    // is dropped, so it cannot poison the seed that is authoritative now.
    await act(async () => {
      staleReceipt.reject(new Error('superseded receipt transport failure'));
    });

    expect(screen.queryByTestId('messaging-read-status-error')).not.toBeInTheDocument();
    expect(screen.getByText('Reseeded server history')).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('drops receipt status invalidated by a cleanup and setup cycle', async () => {
    const gates: ReceiptGate[] = [];
    receipt.mockImplementation(() => {
      const gate = deferred<ReceiptResult>();
      gates.push(gate);
      return gate.promise;
    });

    renderStrictPanel({
      ...SAME_SCOPE,
      initialMessages: [buildMessage({ id: 'msg-strict', content: 'Strict server history' })],
    });

    await waitFor(() => expect(gates.length).toBeGreaterThan(0));
    expect(read).not.toHaveBeenCalled();

    const current = gates[gates.length - 1];
    if (!current) throw new Error('no read receipt was started');

    // A double-invoked setup leaves the earlier receipts in flight. Each one the cleanup
    // invalidated reports a failure here and none of them may speak for the panel mounted now.
    await act(async () => {
      for (const stale of gates.slice(0, -1)) stale.reject(new Error('invalidated receipt'));
      current.resolve({ success: true });
    });

    expect(screen.queryByTestId('messaging-read-status-error')).not.toBeInTheDocument();
    expect(screen.getByText('Strict server history')).toBeInTheDocument();
    expect(receipt).toHaveBeenCalledWith(['msg-strict']);
  });

  it('does not query or loop when an unchanged empty server render repeats', async () => {
    const { rerenderPanel } = renderPanel(SAME_SCOPE);

    expect(await screen.findByTestId('messaging-empty-state')).toBeInTheDocument();

    rerenderPanel(SAME_SCOPE);
    rerenderPanel(SAME_SCOPE);

    expect(screen.getByTestId('messaging-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('messaging-read-error')).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    expect(receipt).not.toHaveBeenCalled();
  });
});
