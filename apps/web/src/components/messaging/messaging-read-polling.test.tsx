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

type ReadResult = Awaited<ReturnType<typeof getMessagesForClaim>>;

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

describe('staff message automatic poll and outstanding reads', () => {
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

  it('does not invalidate a retrieval that outlives several automatic poll ticks', async () => {
    const slow = deferred<ReadResult>();
    read.mockReturnValueOnce(slow.promise);

    renderPanel(PANEL);
    await flush();

    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('claim-1');
    expect(panel()).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('messaging-empty-state')).not.toBeInTheDocument();

    // 90s of automatic polls pass while that first retrieval is still outstanding.
    advanceTicks(3);
    await flush();

    expect(read).toHaveBeenCalledTimes(1);
    expect(panel()).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('messaging-read-error')).not.toBeInTheDocument();

    await act(async () => {
      slow.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-slow', content: 'Slow but still valid reply' })],
      });
    });
    await flush();

    // The read the ticks left alone is still the newest one, so it renders and clears the spinner.
    expect(screen.getByText('Slow but still valid reply')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('aria-busy', 'false');
    expect(receipt).toHaveBeenCalledWith(['msg-slow']);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('resumes the 30s automatic poll once the slow read settled', async () => {
    const slow = deferred<ReadResult>();
    read.mockReturnValueOnce(slow.promise);

    renderPanel(PANEL);
    await flush();

    advanceTicks(2);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);

    await act(async () => {
      slow.resolve({ success: true, messages: [] });
    });
    await flush();

    expect(screen.getByTestId('messaging-empty-state')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);

    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(2);

    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenLastCalledWith('claim-1');
  });

  it('still lets an explicit refresh supersede the read the poll left alone', async () => {
    const slow = deferred<ReadResult>();
    const manual = deferred<ReadResult>();
    read.mockReturnValueOnce(slow.promise).mockReturnValueOnce(manual.promise);

    renderPanel(PANEL);
    await flush();

    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('messaging-refresh'));
    await flush();
    expect(read).toHaveBeenCalledTimes(2);

    // Two reads overlap now, and a tick may not add a third one to the pile.
    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(2);

    await act(async () => {
      manual.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-manual', content: 'Explicit refresh reply' })],
      });
    });
    await flush();

    expect(screen.getByText('Explicit refresh reply')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('aria-busy', 'false');

    await act(async () => {
      slow.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-superseded', content: 'Superseded earlier reply' })],
      });
    });
    await flush();

    expect(screen.queryByText('Superseded earlier reply')).not.toBeInTheDocument();
    expect(screen.getByText('Explicit refresh reply')).toBeInTheDocument();
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(receipt).toHaveBeenCalledWith(['msg-manual']);

    // Both are settled, so the next tick polls again.
    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('releases the automatic poll when a slow retrieval fails', async () => {
    const failing = deferred<ReadResult>();
    read.mockReturnValueOnce(failing.promise);

    renderPanel(PANEL);
    await flush();

    advanceTicks(1);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);

    await act(async () => {
      failing.reject(new Error('read transport failure'));
    });
    await flush();

    expect(screen.getByTestId('messaging-read-error')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('aria-busy', 'false');

    advanceTicks(1);
    await flush();

    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('messaging-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('messaging-read-error')).not.toBeInTheDocument();
  });

  it('stops polling and starts no receipt when a slow read outlives the panel', async () => {
    const slow = deferred<ReadResult>();
    read.mockReturnValueOnce(slow.promise);

    const { unmount } = renderPanel(PANEL);
    await flush();
    unmount();

    advanceTicks(2);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);

    await act(async () => {
      slow.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-late', content: 'Late reply after unmount' })],
      });
    });
    await flush();

    expect(receipt).not.toHaveBeenCalled();
  });
});
