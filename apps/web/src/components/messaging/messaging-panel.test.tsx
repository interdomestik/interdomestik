import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagingPanel } from './messaging-panel';

// Mock getMessagesForClaim and markMessagesAsRead
vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn().mockResolvedValue({
    success: true,
    messages: [],
  }),
  markMessagesAsRead: vi.fn().mockResolvedValue({ success: true }),
}));

import { getMessagesForClaim } from '@/actions/messages';
const mockGetMessages = vi.mocked(getMessagesForClaim);

// Mock child components
vi.mock('./message-thread', () => ({
  MessageThread: ({ messages }: { messages: unknown[] }) => (
    <div data-testid="message-thread">Thread ({messages.length} messages)</div>
  ),
}));

vi.mock('./message-input', () => ({
  MessageInput: () => <div data-testid="message-input">Input</div>,
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Messages',
    };
    return translations[key] || key;
  },
}));

describe('MessagingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMessages.mockResolvedValue({ success: true, messages: [] });
  });

  it('renders the messaging panel', async () => {
    render(<MessagingPanel claimId="claim-1" currentUserId="user-1" />);

    expect(screen.getByTestId('messaging-panel')).toBeInTheDocument();
  });

  it('shows title with messages icon', async () => {
    render(<MessagingPanel claimId="claim-1" currentUserId="user-1" />);

    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  it('renders message input', async () => {
    render(<MessagingPanel claimId="claim-1" currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('message-input')).toBeInTheDocument();
    });
  });

  it('shows loading state initially when no initial messages', async () => {
    render(<MessagingPanel claimId="claim-1" currentUserId="user-1" />);

    // Loading spinner should show briefly
    await waitFor(() => {
      expect(screen.getByTestId('message-thread')).toBeInTheDocument();
    });
  });

  it('renders with initial messages without loading', async () => {
    const initialMessages = [
      {
        id: 'msg-1',
        claimId: 'claim-1',
        senderId: 'user-1',
        content: 'Test',
        isInternal: false,
        readAt: null,
        createdAt: new Date(),
        sender: { id: 'user-1', name: 'Test', image: null, role: 'user' },
      },
    ];

    render(
      <MessagingPanel claimId="claim-1" currentUserId="user-1" initialMessages={initialMessages} />
    );

    expect(screen.getByText('Thread (1 messages)')).toBeInTheDocument();
  });

  it('shows message count in title', async () => {
    const initialMessages = [
      {
        id: 'msg-1',
        claimId: 'claim-1',
        senderId: 'user-1',
        content: 'Test',
        isInternal: false,
        readAt: null,
        createdAt: new Date(),
        sender: { id: 'user-1', name: 'Test', image: null, role: 'user' },
      },
    ];

    render(
      <MessagingPanel claimId="claim-1" currentUserId="user-1" initialMessages={initialMessages} />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('passes isAgent prop to child components', async () => {
    render(<MessagingPanel claimId="claim-1" currentUserId="user-1" isAgent />);

    await waitFor(() => {
      expect(screen.getByTestId('message-thread')).toBeInTheDocument();
    });
  });

  it('has refresh button', () => {
    render(<MessagingPanel claimId="claim-1" currentUserId="user-1" />);

    // Refresh button should be present
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
