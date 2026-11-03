import { getMessagesForClaim, markMessagesAsRead, sendMessage } from '@/actions/messages';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagingPanel, type OptimisticMessage } from './messaging-panel';

vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn(),
  markMessagesAsRead: vi.fn(),
  sendMessage: vi.fn(),
}));

// The input and thread are reduced to their send and retry callbacks.
vi.mock('./message-input', () => ({
  MessageInput: ({
    onSendMessage,
  }: {
    onSendMessage: (content: string, isInternal: boolean) => Promise<boolean>;
  }) => (
    <button type="button" onClick={() => void onSendMessage('Draft reply', false)}>
      send
    </button>
  ),
}));
vi.mock('./message-thread', () => ({
  MessageThread: ({
    messages,
    onRetry,
  }: {
    messages: OptimisticMessage[];
    onRetry?: (message: OptimisticMessage) => void;
  }) =>
    messages
      .filter(message => message.status === 'failed')
      .map(message => (
        <button key={message.id} type="button" onClick={() => onRetry?.(message)}>
          retry
        </button>
      )),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const send = vi.mocked(sendMessage);

describe('MessagingPanel send retry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getMessagesForClaim).mockResolvedValue({ success: true, messages: [] });
    vi.mocked(markMessagesAsRead).mockResolvedValue({ success: true } as never);
  });

  it('resends a failed message under its original client message key', async () => {
    send.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ success: true });
    render(
      <MessagingPanel
        claimId="claim-1"
        currentUser={{ id: 'staff-1', name: 'Staff', image: null, role: 'staff' }}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'send' }));
    await userEvent.click(await screen.findByRole('button', { name: 'retry' }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const clientMessageId = send.mock.calls[0]?.[3];
    expect(clientMessageId).toMatch(/^[\w-]{8,64}$/);
    expect(send).toHaveBeenLastCalledWith('claim-1', 'Draft reply', false, clientMessageId);
  });

  it('gives each new send its own client message key', async () => {
    send.mockResolvedValue({ success: true });
    render(
      <MessagingPanel
        claimId="claim-1"
        currentUser={{ id: 'staff-1', name: 'Staff', image: null, role: 'staff' }}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'send' }));
    await userEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[3]).not.toBe(send.mock.calls[0]?.[3]);
  });
});
