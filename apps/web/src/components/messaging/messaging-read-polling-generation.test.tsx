import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('next-intl');
vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn(),
  markMessagesAsRead: vi.fn(),
}));

import { getMessagesForClaim, markMessagesAsRead } from '@/actions/messages';
import { STAFF_USER, buildMessage, deferred, renderPanel } from './messaging-read-test-support';

type ReadResult = Awaited<ReturnType<typeof getMessagesForClaim>>;
type ReceiptResult = Awaited<ReturnType<typeof markMessagesAsRead>>;
const read = vi.mocked(getMessagesForClaim);
const receipt = vi.mocked(markMessagesAsRead);
const PANEL = { claimId: 'claim-1', currentUser: STAFF_USER };
const refreshedHistory = {
  success: true as const,
  messages: [
    buildMessage({
      id: 'msg-fresh',
      content: 'Manual refresh history',
      readAt: new Date('2026-03-01T10:05:00.000Z'),
    }),
  ],
};

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function tick() {
  await act(async () => {
    vi.advanceTimersByTime(30000);
  });
  await settle();
}

function refresh() {
  fireEvent.click(screen.getByTestId('messaging-refresh'));
}

describe('automatic polling after explicit generation supersession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    read.mockResolvedValue({ success: true, messages: [] });
    receipt.mockResolvedValue({ success: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('resumes polling after manual refresh while the superseded retrieval stays hung', async () => {
    const hung = deferred<ReadResult>();
    read.mockReturnValueOnce(hung.promise).mockResolvedValueOnce(refreshedHistory);
    renderPanel(PANEL);
    await settle();
    await tick();
    expect(read).toHaveBeenCalledTimes(1);

    refresh();
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Manual refresh history')).toBeInTheDocument();
    expect(screen.getByTestId('messaging-panel')).toHaveAttribute('aria-busy', 'false');

    // The old promise is deliberately never settled. It no longer owns this generation's poll.
    await tick();
    expect(read).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('messaging-empty-state')).toBeInTheDocument();
    expect(receipt).not.toHaveBeenCalled();
  });

  it('resumes polling after manual refresh while a superseded SSR receipt stays hung', async () => {
    const hung = deferred<ReceiptResult>();
    receipt.mockReturnValueOnce(hung.promise);
    read.mockResolvedValueOnce(refreshedHistory);
    renderPanel({
      ...PANEL,
      fetchOnMount: false,
      initialMessages: [buildMessage({ id: 'msg-ssr', content: 'SSR history' })],
    });
    await settle();
    expect(receipt).toHaveBeenCalledWith(['msg-ssr']);
    await tick();
    expect(read).not.toHaveBeenCalled();

    refresh();
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Manual refresh history')).toBeInTheDocument();
    await tick();
    expect(read).toHaveBeenCalledTimes(2);
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('messaging-read-status-error')).not.toBeInTheDocument();
  });

  it.each(['returned failure', 'transport failure'] as const)(
    'does not let an old receipt %s release a newer pending retrieval guard',
    async failureKind => {
      const oldReceipt = deferred<ReceiptResult>();
      const currentRead = deferred<ReadResult>();
      receipt.mockReturnValueOnce(oldReceipt.promise);
      read
        .mockResolvedValueOnce({
          success: true,
          messages: [buildMessage({ id: 'msg-old', content: 'Old history' })],
        })
        .mockReturnValueOnce(currentRead.promise);
      renderPanel(PANEL);
      await settle();
      expect(receipt).toHaveBeenCalledTimes(1);

      refresh();
      await settle();
      expect(read).toHaveBeenCalledTimes(2);
      await act(async () => {
        if (failureKind === 'returned failure') {
          oldReceipt.resolve({ success: false, error: 'Old receipt failure' });
        } else {
          oldReceipt.reject(new Error('Old receipt transport failure'));
        }
      });
      await settle();
      await tick();
      expect(read).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('messaging-read-status-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('messaging-panel')).toHaveAttribute('aria-busy', 'true');

      await act(async () => {
        currentRead.resolve(refreshedHistory);
      });
      await settle();
      expect(screen.getByText('Manual refresh history')).toBeInTheDocument();
      await tick();
      expect(read).toHaveBeenCalledTimes(3);
    }
  );
});
