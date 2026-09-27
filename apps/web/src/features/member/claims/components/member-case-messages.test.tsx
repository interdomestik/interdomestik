import {
  getMessagesForClaim,
  markMessagesAsRead,
  sendMessage,
  type MessageWithSender,
} from '@/actions/messages';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberCaseMessages } from './member-case-messages';

vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn(),
  markMessagesAsRead: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => key,
}));
const get = vi.mocked(getMessagesForClaim);
const read = vi.mocked(markMessagesAsRead);
const send = vi.mocked(sendMessage);
const currentUser = { id: 'member' };
const message = (patch: Partial<MessageWithSender> = {}): MessageWithSender => ({
  id: 'message',
  claimId: 'case-a',
  senderId: 'staff',
  content: 'Public reply',
  isInternal: false,
  readAt: null,
  createdAt: new Date('2026-09-27T10:00:00Z'),
  sender: { id: 'staff', name: 'Case team', role: 'staff', image: null },
  ...patch,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
const renderPanel = () => render(<MemberCaseMessages claimId="case-a" currentUser={currentUser} />);

describe('member case messages', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    get.mockResolvedValue({ success: true, messages: [] });
    read.mockResolvedValue({ success: true });
    send.mockResolvedValue({
      success: true,
      message: message({ senderId: 'member', content: 'My message' }),
    });
  });

  it.each(['rejected', 'unsuccessful'] as const)(
    'distinguishes a %s load from empty and retries',
    async failure => {
      if (failure === 'rejected') get.mockRejectedValueOnce(new Error('offline'));
      else get.mockResolvedValueOnce({ success: false, error: 'denied' });
      renderPanel();
      expect(screen.getByRole('status')).toHaveTextContent('member.loading');
      expect(await screen.findByRole('alert')).toHaveTextContent('member.loadError');
      expect(screen.queryByText('empty.title')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'retry' }));
      expect(await screen.findByText('empty.title')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  );

  it('renders and marks read only public messages for this case', async () => {
    get.mockResolvedValue({
      success: true,
      messages: [
        message(),
        message({ id: 'private', content: 'Internal note', isInternal: true }),
        message({ id: 'other', content: 'Other case', claimId: 'case-b' }),
      ],
    });
    renderPanel();
    expect(await screen.findByText('Public reply')).toBeInTheDocument();
    expect(screen.queryByText('Internal note')).not.toBeInTheDocument();
    expect(screen.queryByText('Other case')).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledWith(['message']);
    expect(screen.getByText(/27\.09\.2026/)).toBeInTheDocument();
  });

  it.each(['rejected', 'unsuccessful'] as const)(
    'keeps readable messages when read acknowledgement is %s',
    async failure => {
      get.mockResolvedValue({ success: true, messages: [message()] });
      if (failure === 'rejected') read.mockRejectedValueOnce(new Error('offline'));
      else read.mockResolvedValueOnce({ success: false, error: 'denied' });
      renderPanel();
      expect(await screen.findByText('Public reply')).toBeInTheDocument();
      expect(await screen.findByRole('alert')).toHaveTextContent('member.readError');
      await userEvent.click(screen.getByRole('button', { name: 'retry' }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    }
  );

  it.each(['rejected', 'unsuccessful'] as const)(
    'preserves draft on %s send and allows retry',
    async failure => {
      if (failure === 'rejected') send.mockRejectedValueOnce(new Error('offline'));
      else send.mockResolvedValueOnce({ success: false, error: 'denied' });
      renderPanel();
      await screen.findByText('empty.title');
      const input = screen.getByRole('textbox', { name: 'member.label' });
      await userEvent.type(input, 'My message');
      await userEvent.click(screen.getByRole('button', { name: 'member.send' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('member.sendError');
      expect(input).toHaveValue('My message');
      await userEvent.click(screen.getByRole('button', { name: 'member.send' }));
      expect(await screen.findByText('My message')).toBeInTheDocument();
      expect(input).toHaveValue('');
      expect(send).toHaveBeenLastCalledWith('case-a', 'My message', false);
    }
  );

  it('retains an acknowledged send when refresh fails without offering a duplicate send', async () => {
    renderPanel();
    await screen.findByText('empty.title');
    get.mockRejectedValueOnce(new Error('offline'));
    await userEvent.type(screen.getByRole('textbox'), 'My message');
    await userEvent.click(screen.getByRole('button', { name: 'member.send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('member.loadError');
    expect(screen.getByText('My message')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('sent');
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'member.send' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('My message')).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['ctrlKey', 'metaKey'])(
    'sends with %s Enter and locks duplicate in-flight sends',
    async modifier => {
      const pending = deferred<Awaited<ReturnType<typeof sendMessage>>>();
      send.mockReturnValueOnce(pending.promise);
      renderPanel();
      await screen.findByText('empty.title');
      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'My message');
      fireEvent.keyDown(input, { key: 'Enter', [modifier]: true });
      fireEvent.keyDown(input, { key: 'Enter', [modifier]: true });
      expect(send).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'member.send' })).toBeDisabled();
      await act(async () =>
        pending.resolve({ success: true, message: message({ content: 'My message' }) })
      );
      expect(await screen.findByText('My message')).toBeInTheDocument();
    }
  );

  it('ignores an old case fetch and clears its draft immediately on case switch', async () => {
    const old = deferred<Awaited<ReturnType<typeof getMessagesForClaim>>>();
    get.mockReturnValueOnce(old.promise);
    const view = renderPanel();
    await userEvent.type(screen.getByRole('textbox'), 'Old draft');
    view.rerender(<MemberCaseMessages claimId="case-b" currentUser={currentUser} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    await screen.findByText('empty.title');
    await act(async () => old.resolve({ success: true, messages: [message()] }));
    expect(screen.queryByText('Public reply')).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('ignores old send completion without clearing the new case draft', async () => {
    const old = deferred<Awaited<ReturnType<typeof sendMessage>>>();
    send.mockReturnValueOnce(old.promise);
    const view = renderPanel();
    await screen.findByText('empty.title');
    await userEvent.type(screen.getByRole('textbox'), 'Old draft');
    await userEvent.click(screen.getByRole('button', { name: 'member.send' }));
    view.rerender(<MemberCaseMessages claimId="case-b" currentUser={currentUser} />);
    await userEvent.type(screen.getByRole('textbox'), 'New draft');
    await act(async () =>
      old.resolve({ success: true, message: message({ content: 'Old draft' }) })
    );
    expect(screen.getByRole('textbox')).toHaveValue('New draft');
    expect(screen.queryByText('Old draft')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('deduplicates the acknowledged message when refresh includes it', async () => {
    renderPanel();
    await screen.findByText('empty.title');
    get.mockResolvedValue({
      success: true,
      messages: [message({ content: 'My message', senderId: 'member' })],
    });
    await userEvent.type(screen.getByRole('textbox'), 'My message');
    await userEvent.click(screen.getByRole('button', { name: 'member.send' }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(screen.getAllByText('My message')).toHaveLength(1);
  });

  it('does not mark a late response as read after unmount', async () => {
    const pending = deferred<Awaited<ReturnType<typeof getMessagesForClaim>>>();
    get.mockReturnValueOnce(pending.promise);
    const view = renderPanel();
    view.unmount();
    await act(async () => pending.resolve({ success: true, messages: [message()] }));
    expect(read).not.toHaveBeenCalled();
  });
  it('polls visible cases every 30 seconds without overlapping a pending refresh and stops on unmount', async () => {
    vi.useFakeTimers();
    const pending = deferred<Awaited<ReturnType<typeof getMessagesForClaim>>>();
    try {
      const view = renderPanel();
      await act(async () => {});
      expect(get).toHaveBeenCalledTimes(1);
      get.mockReturnValueOnce(pending.promise);
      await act(async () => vi.advanceTimersByTime(30_000));
      expect(get).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTime(60_000));
      expect(get).toHaveBeenCalledTimes(2);
      await act(async () => pending.resolve({ success: true, messages: [message()] }));
      expect(screen.getByText('Public reply')).toBeInTheDocument();
      view.unmount();
      await act(async () => vi.advanceTimersByTime(30_000));
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('makes history keyboard reachable, follows newest initially, preserves earlier reading and reveals an own send', async () => {
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    const viewport = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    try {
      get.mockResolvedValue({ success: true, messages: [message()] });
      renderPanel();
      const history = await screen.findByRole('list', { name: 'title' });
      expect(history).toHaveAttribute('tabindex', '0');
      expect(history.scrollTop).toBe(1000);
      await userEvent.tab();
      await userEvent.tab();
      expect(history).toHaveFocus();
      history.scrollTop = 100;
      fireEvent.scroll(history);
      get.mockResolvedValue({
        success: true,
        messages: [message(), message({ id: 'reply-2', content: 'New reply' })],
      });
      await userEvent.click(screen.getByRole('button', { name: 'member.refresh' }));
      await screen.findByText('New reply');
      expect(history.scrollTop).toBe(100);
      send.mockResolvedValueOnce({
        success: true,
        message: message({ id: 'own-send', senderId: 'member', content: 'My message' }),
      });
      await userEvent.type(screen.getByRole('textbox'), 'My message');
      await userEvent.click(screen.getByRole('button', { name: 'member.send' }));
      await screen.findByText('My message');
      expect(history.scrollTop).toBe(1000);
    } finally {
      height.mockRestore();
      viewport.mockRestore();
    }
  });

  it('shows a localized read receipt only for an own message acknowledged as read', async () => {
    const readAt = new Date();
    get.mockResolvedValue({
      success: true,
      messages: [
        message({ id: 'own-read', senderId: 'member', readAt }),
        message({ id: 'own-unread', senderId: 'member' }),
        message({ id: 'staff-read', readAt }),
      ],
    });
    renderPanel();
    expect(await screen.findByText('member.read')).toBeInTheDocument();
    expect(screen.getAllByText('member.read')).toHaveLength(1);
  });
});
