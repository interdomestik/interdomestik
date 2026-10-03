import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The global test setup replaces next-intl with a key-echoing mock that has no
// NextIntlClientProvider. This suite composes the shipped catalogs for real, so it opts back into
// the real module exactly as the other real-catalog suites do.
vi.unmock('next-intl');

vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn(),
  markMessagesAsRead: vi.fn(),
}));

import { getMessagesForClaim, markMessagesAsRead } from '@/actions/messages';
import {
  type PanelProps,
  STAFF_USER,
  buildMessage,
  deferred,
  renderPanel,
} from './messaging-read-test-support';

type ReceiptResult = Awaited<ReturnType<typeof markMessagesAsRead>>;

const read = vi.mocked(getMessagesForClaim);
const receipt = vi.mocked(markMessagesAsRead);

// The shipped policy is one automatic poll every 30s. It is spelled out instead of imported from
// the hook so that shortening or lengthening the real cadence fails this suite instead of moving
// with it.
const POLL_INTERVAL_MS = 30000;

const PANEL: PanelProps = { claimId: 'claim-1', currentUser: STAFF_USER };

function panel() {
  return screen.getByTestId('messaging-panel');
}

function statusError() {
  return screen.queryByTestId('messaging-read-status-error');
}

// Only the timers are faked: React schedules its own work and the action transport settles through
// microtasks, and both have to keep running for real while the clock is driven by hand.
function advanceTicks(ticks: number) {
  for (let index = 0; index < ticks; index += 1) {
    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
  }
}

// A read first commits its history and only then starts its receipt, so each step is given several
// microtask turns before anything is asserted.
async function flush() {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  });
}

// The next receipt settles only when this suite says so, which is how a receipt slower than the
// poll interval is reproduced without sleeping.
function gateReceipt() {
  const gate = deferred<ReceiptResult>();
  receipt.mockReturnValueOnce(gate.promise);
  return gate;
}

describe('staff message read receipts outliving the automatic poll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    receipt.mockResolvedValue({ success: true });
    read.mockResolvedValue({ success: true, messages: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('surfaces the failure of a receipt slower than several automatic poll ticks', async () => {
    read.mockResolvedValueOnce({
      success: true,
      messages: [buildMessage({ id: 'msg-unread', content: 'Unread member reply' })],
    });
    const gate = gateReceipt();

    renderPanel(PANEL);
    await flush();

    expect(receipt).toHaveBeenCalledWith(['msg-unread']);
    expect(panel()).toHaveAttribute('aria-busy', 'false');
    expect(statusError()).not.toBeInTheDocument();

    // 90s of automatic polls pass while that receipt is still outstanding.
    advanceTicks(3);
    await flush();

    expect(read).toHaveBeenCalledTimes(1);
    expect(receipt).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.reject(new Error('receipt transport failure'));
    });
    await flush();

    // The receipt the ticks left alone still speaks for this panel, so its failure is visible
    // instead of being swallowed by a generation the poll would otherwise have taken.
    expect(statusError()).toBeInTheDocument();
    expect(screen.getByText('Unread member reply')).toBeInTheDocument();

    // Rejecting released the claim, so the unchanged cadence polls again on the next tick.
    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('starts no duplicate retrieval or receipt while a receipt is outstanding', async () => {
    read.mockResolvedValueOnce({
      success: true,
      messages: [buildMessage({ id: 'msg-unread', content: 'Unread member reply' })],
    });
    const gate = gateReceipt();

    renderPanel(PANEL);
    await flush();
    expect(receipt).toHaveBeenCalledWith(['msg-unread']);

    advanceTicks(2);
    await flush();

    // No second retrieval, and above all no second acknowledgement of the same message.
    expect(read).toHaveBeenCalledTimes(1);
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Unread member reply')).toBeInTheDocument();

    await act(async () => {
      gate.resolve({ success: true });
    });
    await flush();

    expect(statusError()).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);

    // Nothing is in flight now, so the 30s cadence resumes on the very next tick and keeps going.
    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(receipt).toHaveBeenCalledTimes(1);

    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenLastCalledWith('claim-1');
  });

  it('keeps the receipt of a server-rendered history out of the automatic poll', async () => {
    const gate = gateReceipt();

    renderPanel({
      ...PANEL,
      fetchOnMount: false,
      initialMessages: [buildMessage({ id: 'msg-ssr', content: 'Server-rendered reply' })],
    });
    await flush();

    expect(receipt).toHaveBeenCalledWith(['msg-ssr']);
    expect(read).not.toHaveBeenCalled();

    advanceTicks(2);
    await flush();

    // The server-rendered receipt is the only outstanding operation, and the poll still waits.
    expect(read).not.toHaveBeenCalled();
    expect(receipt).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.reject(new Error('server-rendered receipt transport failure'));
    });
    await flush();

    expect(statusError()).toBeInTheDocument();
    expect(screen.getByText('Server-rendered reply')).toBeInTheDocument();

    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('still lets an explicit refresh supersede an outstanding receipt', async () => {
    read
      .mockResolvedValueOnce({
        success: true,
        messages: [buildMessage({ id: 'msg-unread', content: 'Unread member reply' })],
      })
      .mockResolvedValueOnce({
        success: true,
        messages: [
          buildMessage({
            id: 'msg-manual',
            content: 'Explicit refresh reply',
            readAt: new Date('2026-03-01T10:05:00.000Z'),
          }),
        ],
      });
    const gate = gateReceipt();

    renderPanel(PANEL);
    await flush();
    expect(receipt).toHaveBeenCalledWith(['msg-unread']);

    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);

    // The poll waits for the receipt, but the staff member asking for fresh history does not.
    fireEvent.click(screen.getByTestId('messaging-refresh'));
    await flush();

    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Explicit refresh reply')).toBeInTheDocument();
    expect(receipt).toHaveBeenCalledTimes(1);

    // That receipt was already on its way and is not claimed to be cancelled; only the status it
    // reports is dropped, because the explicit refresh is authoritative now.
    await act(async () => {
      gate.reject(new Error('superseded receipt transport failure'));
    });
    await flush();

    expect(statusError()).not.toBeInTheDocument();
    expect(screen.getByText('Explicit refresh reply')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('aria-busy', 'false');

    // The supersession released no claim of the older operation early and leaked none either: the
    // cadence polls again now that both of them have settled.
    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('drops an outstanding receipt on unmount and starts nothing further', async () => {
    read.mockResolvedValueOnce({
      success: true,
      messages: [buildMessage({ id: 'msg-unread', content: 'Unread member reply' })],
    });
    const gate = gateReceipt();

    const { unmount } = renderPanel(PANEL);
    await flush();
    expect(receipt).toHaveBeenCalledWith(['msg-unread']);

    unmount();
    advanceTicks(2);
    await flush();

    await act(async () => {
      gate.reject(new Error('receipt transport failure after unmount'));
    });
    await flush();

    // The unmounted panel neither reports that failure nor polls again.
    expect(screen.queryByTestId('messaging-panel')).not.toBeInTheDocument();
    expect(statusError()).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
    expect(receipt).toHaveBeenCalledTimes(1);
  });
});
