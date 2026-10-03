import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
import {
  STAFF_USER,
  buildMessage,
  copy,
  deferred,
  renderPanel,
} from './messaging-read-test-support';

type ReadResult = Awaited<ReturnType<typeof getMessagesForClaim>>;

const read = vi.mocked(getMessagesForClaim);
const receipt = vi.mocked(markMessagesAsRead);

describe('staff message read scope and staleness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    receipt.mockResolvedValue({ success: true });
    read.mockResolvedValue({ success: true, messages: [] });
  });

  it('surfaces a failed server read without issuing a mount query', async () => {
    renderPanel({
      allowInternal: true,
      claimId: 'claim-1',
      currentUser: STAFF_USER,
      fetchOnMount: false,
      initialReadFailed: true,
    });

    expect(await screen.findByTestId('messaging-read-error')).toHaveTextContent(
      copy.read.loadError
    );
    expect(screen.queryByTestId('messaging-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText(copy.empty.title)).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    expect(receipt).not.toHaveBeenCalled();
    expect(screen.getByTestId('message-input')).toBeInTheDocument();
  });

  it('renders a server-loaded empty conversation only when the server read succeeded', async () => {
    renderPanel({ claimId: 'claim-1', currentUser: STAFF_USER, fetchOnMount: false });

    expect(await screen.findByTestId('messaging-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('messaging-read-error')).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('marks server-rendered unread messages without a new read', async () => {
    renderPanel({
      claimId: 'claim-1',
      currentUser: STAFF_USER,
      fetchOnMount: false,
      initialMessages: [buildMessage({ id: 'msg-ssr', content: 'Server rendered reply' })],
    });

    await waitFor(() => expect(receipt).toHaveBeenCalledWith(['msg-ssr']));
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByText('Server rendered reply')).toBeInTheDocument();
  });

  it('renders only the latest read when responses arrive out of order', async () => {
    const first = deferred<ReadResult>();
    const second = deferred<ReadResult>();
    read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    renderPanel({ claimId: 'claim-1', currentUser: STAFF_USER });

    fireEvent.click(screen.getByTestId('messaging-refresh'));

    await act(async () => {
      second.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-new', content: 'Newest reply' })],
      });
    });

    expect(screen.getByText('Newest reply')).toBeInTheDocument();
    await waitFor(() => expect(receipt).toHaveBeenCalledWith(['msg-new']));

    await act(async () => {
      first.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-stale', content: 'Stale reply' })],
      });
    });

    expect(screen.getByText('Newest reply')).toBeInTheDocument();
    expect(screen.queryByText('Stale reply')).not.toBeInTheDocument();
    expect(receipt).toHaveBeenCalledTimes(1);
  });

  it('never renders the previous claim history or draft while a new scope read is pending', async () => {
    read.mockResolvedValueOnce({
      success: true,
      messages: [buildMessage({ content: 'Claim one history' })],
    });
    const pending = deferred<ReadResult>();

    const { rerenderPanel } = renderPanel({ claimId: 'claim-1', currentUser: STAFF_USER });

    expect(await screen.findByText('Claim one history')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('message-input'), {
      target: { value: 'Draft for claim one' },
    });

    read.mockReturnValueOnce(pending.promise);
    rerenderPanel({ claimId: 'claim-2', currentUser: STAFF_USER });

    expect(screen.queryByText('Claim one history')).not.toBeInTheDocument();
    expect(screen.queryByTestId('messaging-empty-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-input')).toHaveValue('');
    expect(read).toHaveBeenLastCalledWith('claim-2');

    await act(async () => {
      pending.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-2', claimId: 'claim-2', content: 'Claim two history' })],
      });
    });

    expect(screen.getByText('Claim two history')).toBeInTheDocument();
  });

  it.each([
    ['user', { ...STAFF_USER, id: 'staff-2' }],
    ['role', { ...STAFF_USER, role: 'branch_manager' }],
  ])('clears the loaded conversation when the %s scope changes', async (_label, nextUser) => {
    read.mockResolvedValueOnce({
      success: true,
      messages: [buildMessage({ content: 'First scope history' })],
    });
    const pending = deferred<ReadResult>();

    const { rerenderPanel } = renderPanel({ claimId: 'claim-1', currentUser: STAFF_USER });

    expect(await screen.findByText('First scope history')).toBeInTheDocument();

    read.mockReturnValueOnce(pending.promise);
    rerenderPanel({ claimId: 'claim-1', currentUser: nextUser });

    expect(screen.queryByText('First scope history')).not.toBeInTheDocument();
    expect(screen.queryByTestId('messaging-empty-state')).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve({ success: true, messages: [] });
    });

    expect(screen.getByTestId('messaging-empty-state')).toBeInTheDocument();
  });

  it('does not start a read receipt for a read that resolves after unmount', async () => {
    const pending = deferred<ReadResult>();
    read.mockReturnValueOnce(pending.promise);

    const { unmount } = renderPanel({ claimId: 'claim-1', currentUser: STAFF_USER });

    unmount();

    await act(async () => {
      pending.resolve({
        success: true,
        messages: [buildMessage({ id: 'msg-late', content: 'Late reply' })],
      });
    });

    expect(receipt).not.toHaveBeenCalled();
  });
});
