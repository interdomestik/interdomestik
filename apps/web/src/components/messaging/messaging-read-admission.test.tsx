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
  initialCanAcknowledge: false,
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
    read.mockResolvedValue({ success: true, canAcknowledge: true, messages: [buildMessage()] });
    receipt.mockResolvedValue({ success: false, error: 'Access denied' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('uses refreshed server permission with unchanged client props: allowed, denied, allowed', async () => {
    receipt.mockResolvedValue({ success: true });
    const { result } = renderHook(useMessageReadState, { initialProps: options });
    await flush();
    expect(receipt).toHaveBeenCalledTimes(1);
    read.mockResolvedValueOnce({
      success: true,
      canAcknowledge: false,
      messages: [buildMessage()],
    });
    await tick();
    expect(receipt).toHaveBeenCalledTimes(1);
    await tick();
    expect(read).toHaveBeenCalledTimes(3);
    expect(receipt).toHaveBeenCalledTimes(2);
    expect(result.current.readStatusFailed).toBe(false);
  });

  it('keeps a raced denial silent and lets the next history load decide again', async () => {
    const { result } = renderHook(useMessageReadState, { initialProps: options });
    await flush();
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(result.current.readStatusFailed).toBe(false);
    read.mockResolvedValueOnce({
      success: true,
      canAcknowledge: false,
      messages: [buildMessage()],
    });
    await tick();
    expect(receipt).toHaveBeenCalledTimes(1);
    receipt.mockResolvedValue({ success: true });
    await act(() => result.current.refresh());
    expect(read).toHaveBeenCalledTimes(3);
    expect(receipt).toHaveBeenCalledTimes(2);
    expect(result.current.retrievalFailed).toBe(false);
    expect(result.current.readStatusFailed).toBe(false);
  });

  it('fails closed when history omits acknowledgement capability', async () => {
    read.mockResolvedValue({ success: true, messages: [buildMessage()] });
    renderHook(useMessageReadState, { initialProps: options });
    await flush();
    expect(receipt).not.toHaveBeenCalled();
  });

  it.each(['result', '500', 'transport'])(
    'preserves error and retry for another %s failure',
    async kind => {
      if (kind !== 'transport') {
        receipt.mockResolvedValueOnce({
          success: false,
          error: kind === '500' ? '500 Internal Server Error' : 'Failed to mark messages as read',
        });
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

  it('uses changed server seed capability without a client scope change', async () => {
    receipt.mockResolvedValue({ success: true });
    const seeded = { ...options, fetchOnMount: false, initialMessages: [buildMessage()] };
    const { rerender } = renderHook(useMessageReadState, { initialProps: seeded });
    await flush();
    expect(receipt).not.toHaveBeenCalled();
    rerender({ ...seeded, initialCanAcknowledge: true });
    await flush();
    expect(receipt).toHaveBeenCalledTimes(1);
    rerender(seeded);
    await flush();
    expect(receipt).toHaveBeenCalledTimes(1);
  });

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
