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

// The real composer stays mounted; the thread is reduced to its retry callback.
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
const keyOfCall = (index: number) => send.mock.calls[index]?.[3];

function renderPanel(allowInternal = false) {
  render(
    <MessagingPanel
      claimId="claim-1"
      currentUser={{ id: 'staff-1', name: 'Staff', image: null, role: 'admin' }}
      allowInternal={allowInternal}
    />
  );
}

async function submitDraft(text?: string) {
  if (text !== undefined) await userEvent.type(screen.getByTestId('message-input'), text);
  await userEvent.click(screen.getByTestId('send-message-button'));
}

describe('MessagingPanel send retry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getMessagesForClaim).mockResolvedValue({
      success: true,
      canAcknowledge: true,
      messages: [],
    });
    vi.mocked(markMessagesAsRead).mockResolvedValue({ success: true } as never);
  });

  it('resubmits an unchanged draft under its key and rotates the key after success', async () => {
    send.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ success: true });
    renderPanel();

    await submitDraft('Draft reply');
    expect(await screen.findByTestId('message-inline-error')).toBeInTheDocument();
    expect(screen.getByTestId('message-input')).toHaveValue('Draft reply');
    await submitDraft();
    await waitFor(() => expect(screen.getByTestId('message-input')).toHaveValue(''));
    await submitDraft('Next reply');

    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(keyOfCall(0)).toMatch(/^[\w-]{8,64}$/);
    expect(send).toHaveBeenNthCalledWith(2, 'claim-1', 'Draft reply', false, keyOfCall(0));
    expect(keyOfCall(2)).not.toBe(keyOfCall(0));
  });

  it('gives an edited draft a new key after a failed send', async () => {
    send.mockResolvedValueOnce({ success: false, error: 'denied' });
    renderPanel();

    await submitDraft('Draft reply');
    expect(await screen.findByTestId('message-inline-error')).toBeInTheDocument();
    await submitDraft(' edited');

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[1]).toBe('Draft reply edited');
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it('gives the same text a new key once its earlier send succeeded', async () => {
    send.mockResolvedValue({ success: true });
    renderPanel();

    await submitDraft('Same reply');
    await waitFor(() => expect(screen.getByTestId('message-input')).toHaveValue(''));
    await submitDraft('Same reply');

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it('gives a failed draft a new key when its audience changes', async () => {
    send.mockResolvedValueOnce({ success: false, error: 'denied' });
    renderPanel(true);

    await submitDraft('Draft note');
    expect(await screen.findByTestId('message-inline-error')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('internal-note-toggle'));
    await submitDraft();

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.slice(0, 3)).toEqual(['claim-1', 'Draft note', true]);
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it('resends a failed thread message under its original key', async () => {
    send.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ success: true });
    renderPanel();

    await submitDraft('Draft reply');
    await userEvent.click(await screen.findByRole('button', { name: 'retry' }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenLastCalledWith('claim-1', 'Draft reply', false, keyOfCall(0));
  });
});
