import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The global test setup replaces next-intl with a key-echoing mock that has no
// NextIntlClientProvider. This suite composes the shipped catalogs for real, so it opts back into
// the real module exactly as the other real-catalog suites do.
vi.unmock('next-intl');

// Only the server action transport is mocked: the real panel, thread, input and shipped catalogs
// are composed for real.
vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn(),
  markMessagesAsRead: vi.fn(),
}));

import { getMessagesForClaim, markMessagesAsRead } from '@/actions/messages';
import {
  STAFF_USER,
  buildMessage,
  catalogs,
  copy,
  deferred,
  renderPanel,
} from './messaging-read-test-support';

type ReadResult = Awaited<ReturnType<typeof getMessagesForClaim>>;

const read = vi.mocked(getMessagesForClaim);
const receipt = vi.mocked(markMessagesAsRead);

const STAFF_PANEL = {
  allowInternal: true,
  claimId: 'claim-1',
  currentUser: STAFF_USER,
};

describe('staff message read recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    receipt.mockResolvedValue({ success: true });
  });

  it('failed read never claims empty conversation', async () => {
    read.mockResolvedValue({ success: false, error: 'private backend detail' });

    renderPanel(STAFF_PANEL);

    const failure = await screen.findByTestId('messaging-read-error');
    expect(failure).toHaveTextContent(copy.read.loadError);
    expect(screen.getByTestId('messaging-read-retry')).toHaveTextContent(copy.read.retry);
    expect(screen.getByTestId('messaging-refresh')).toHaveAttribute(
      'aria-label',
      copy.read.refresh
    );
    expect(screen.queryByTestId('messaging-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText(copy.empty.title)).not.toBeInTheDocument();
    expect(screen.queryByText(/private backend detail/)).not.toBeInTheDocument();
    expect(screen.getByTestId('message-input')).toBeInTheDocument();
  });

  it.each([
    ['an unsuccessful result', () => read.mockResolvedValueOnce({ success: false })],
    ['a rejected read', () => read.mockRejectedValueOnce(new Error('private transport detail'))],
    ['a missing message payload', () => read.mockResolvedValueOnce({ success: true })],
  ])(
    'reaches a truthful empty conversation from %s only after a successful retry',
    async (_label, arrange) => {
      arrange();
      read.mockResolvedValueOnce({ success: true, messages: [] });

      renderPanel(STAFF_PANEL);

      await screen.findByTestId('messaging-read-error');
      expect(screen.queryByTestId('messaging-empty-state')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('messaging-read-retry'));

      expect(await screen.findByTestId('messaging-empty-state')).toBeInTheDocument();
      expect(screen.getByText(copy.empty.title)).toBeInTheDocument();
      expect(screen.queryByTestId('messaging-read-error')).not.toBeInTheDocument();
    }
  );

  it('keeps loaded history and the editable draft when a refresh fails', async () => {
    read.mockResolvedValueOnce({
      success: true,
      messages: [buildMessage({ content: 'Policy document received' })],
    });

    renderPanel(STAFF_PANEL);

    expect(await screen.findByText('Policy document received')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('message-input'), {
      target: { value: 'Draft reply to the member' },
    });

    read.mockResolvedValueOnce({ success: false, error: 'private backend detail' });
    fireEvent.click(screen.getByTestId('messaging-refresh'));

    await screen.findByTestId('messaging-read-error');
    expect(screen.getByText('Policy document received')).toBeInTheDocument();
    expect(screen.getByTestId('message-input')).toHaveValue('Draft reply to the member');
    expect(screen.getByTestId('message-input')).not.toBeDisabled();
    expect(screen.queryByTestId('messaging-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText(/private backend detail/)).not.toBeInTheDocument();
  });

  it.each([
    [
      'an unsuccessful',
      () => receipt.mockResolvedValue({ success: false, error: 'private receipt detail' }),
    ],
    ['a rejected', () => receipt.mockRejectedValue(new Error('private receipt detail'))],
  ])('separates %s read receipt from the retrieval outcome', async (_label, arrange) => {
    read.mockResolvedValue({
      success: true,
      messages: [buildMessage({ content: 'Member reply' })],
    });
    arrange();

    renderPanel(STAFF_PANEL);

    expect(await screen.findByText('Member reply')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('messaging-read-status-error')).toHaveTextContent(
        copy.read.statusError
      )
    );
    expect(screen.queryByTestId('messaging-read-error')).not.toBeInTheDocument();
    expect(screen.queryByText(/private receipt detail/)).not.toBeInTheDocument();
  });

  it('reports genuine async read completion through aria-busy', async () => {
    const held = deferred<ReadResult>();
    read.mockReturnValueOnce(held.promise);

    renderPanel(STAFF_PANEL);

    const panel = screen.getByTestId('messaging-panel');
    await waitFor(() => expect(panel).toHaveAttribute('aria-busy', 'true'));

    await act(async () => {
      held.resolve({ success: true, messages: [] });
    });

    expect(panel).toHaveAttribute('aria-busy', 'false');
  });

  it('localizes the recoverable read failure', async () => {
    read.mockResolvedValue({ success: false });

    renderPanel(STAFF_PANEL, { locale: 'sq' });

    expect(await screen.findByTestId('messaging-read-error')).toHaveTextContent(
      catalogs.sq.messaging.read.loadError
    );
    expect(screen.getByTestId('messaging-read-retry')).toHaveTextContent(
      catalogs.sq.messaging.read.retry
    );
  });

  it('preserves readOnly and internal-note composition', async () => {
    read.mockResolvedValue({ success: true, messages: [] });

    const { rerenderPanel } = renderPanel(STAFF_PANEL);

    expect(await screen.findByTestId('message-input')).toBeInTheDocument();
    expect(screen.getByTestId('internal-note-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('send-message-button')).toBeInTheDocument();

    rerenderPanel({ ...STAFF_PANEL, readOnly: true });

    await waitFor(() => expect(screen.queryByTestId('message-input')).not.toBeInTheDocument());
    expect(screen.queryByTestId('internal-note-toggle')).not.toBeInTheDocument();
  });
});
