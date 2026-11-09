import { act, cleanup, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('next-intl');
vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn(),
  markMessagesAsRead: vi.fn(),
}));

import { getMessagesForClaim, markMessagesAsRead } from '@/actions/messages';
import { buildMessage, renderPanel, STAFF_USER } from './messaging-read-test-support';
import { NO_MESSAGES, useMessageReadState } from './use-message-read-state';

const read = vi.mocked(getMessagesForClaim);
const receipt = vi.mocked(markMessagesAsRead);
const options = {
  claimId: 'claim-1',
  currentUserId: 'viewer-1',
  currentUserRole: 'global_support',
  canAcknowledge: true,
  fetchOnMount: true,
  initialMessages: NO_MESSAGES,
  initialReadFailed: false,
};
const flush = () => act(() => Promise.resolve());
const tick = () => act(() => vi.advanceTimersByTimeAsync(30000));

describe('message receipt admission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    read.mockResolvedValue({ success: true, messages: [buildMessage()] });
    receipt.mockResolvedValue({ success: false, error: 'Access denied' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('silently stops denied receipts while polling and manual refresh still read history', async () => {
    const { result } = renderHook(useMessageReadState, { initialProps: options });
    await flush();
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(result.current.readStatusFailed).toBe(false);
    await tick();
    await tick();
    await act(() => result.current.refresh());
    expect(read).toHaveBeenCalledTimes(4);
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.readStatusFailed).toBe(false);
    expect(result.current.retrievalFailed).toBe(false);
  });

  it.each(['result', 'transport'])(
    'preserves error and retry for another %s failure',
    async kind => {
      if (kind === 'result') {
        receipt.mockResolvedValueOnce({ success: false, error: 'Failed to mark messages as read' });
      } else {
        receipt.mockRejectedValueOnce(new Error('transport failure'));
      }
      receipt.mockResolvedValue({ success: true });
      const { result } = renderHook(useMessageReadState, { initialProps: options });
      await flush();
      expect(result.current.readStatusFailed).toBe(true);
      await tick();
      expect(receipt).toHaveBeenCalledTimes(2);
      expect(result.current.readStatusFailed).toBe(false);
    }
  );

  it.each(['claimId', 'currentUserId', 'currentUserRole'] as const)(
    'resets terminal denial when %s changes, including returning to the original scope',
    async field => {
      const { result, rerender } = renderHook(useMessageReadState, { initialProps: options });
      await flush();
      rerender({ ...options, [field]: 'new-scope' });
      await flush();
      expect(receipt).toHaveBeenCalledTimes(2);
      rerender(options);
      await flush();
      expect(receipt).toHaveBeenCalledTimes(3);
      expect(result.current.readStatusFailed).toBe(false);
    }
  );

  it.each([true, false])(
    'read-only panel sends no receipts (fetchOnMount=%s)',
    async fetchOnMount => {
      renderPanel({
        claimId: options.claimId,
        currentUser: { ...STAFF_USER, role: 'branch_manager' },
        readOnly: true,
        fetchOnMount,
        initialMessages: [buildMessage()],
      });
      await flush();
      await tick();
      expect(read).toHaveBeenCalledTimes(fetchOnMount ? 2 : 1);
      expect(receipt).not.toHaveBeenCalled();
      expect(screen.queryByTestId('messaging-read-status-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('message-input')).not.toBeInTheDocument();
      expect(screen.getByText('Member asked about the case')).toBeInTheDocument();
    }
  );
});
