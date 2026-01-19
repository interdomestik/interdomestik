import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageThread } from './message-thread';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'empty.title': 'No messages yet',
      'empty.description': 'Start a conversation to get help with your claim',
      today: 'Today',
      yesterday: 'Yesterday',
      agentBadge: 'Agent',
      internalNote: 'Internal Note',
    };
    return translations[key] || key;
  },
}));

const mockMessages = [
  {
    id: 'msg-1',
    claimId: 'claim-1',
    senderId: 'user-1',
    content: 'Hello, I need help with my claim',
    isInternal: false,
    readAt: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    sender: {
      id: 'user-1',
      name: 'John Doe',
      image: null,
      role: 'user',
    },
  },
  {
    id: 'msg-2',
    claimId: 'claim-1',
    senderId: 'agent-1',
    content: 'Hi John, I am here to help',
    isInternal: false,
    readAt: new Date('2024-01-15T10:05:00Z'),
    createdAt: new Date('2024-01-15T10:05:00Z'),
    sender: {
      id: 'agent-1',
      name: 'Agent Smith',
      image: 'https://example.com/avatar.jpg',
      role: 'agent',
    },
  },
  {
    id: 'msg-3',
    claimId: 'claim-1',
    senderId: 'agent-1',
    content: 'This is an internal note',
    isInternal: true,
    readAt: null,
    createdAt: new Date('2024-01-15T10:10:00Z'),
    sender: {
      id: 'agent-1',
      name: 'Agent Smith',
      image: null,
      role: 'agent',
    },
  },
];

describe('MessageThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no messages', () => {
    render(
      <MessageThread
        messages={[]}
        currentUser={{ id: 'user-1', name: 'User', image: null, role: 'user' }}
      />
    );

    expect(screen.getByText('No messages yet')).toBeInTheDocument();
    expect(
      screen.getByText('Start a conversation to get help with your claim')
    ).toBeInTheDocument();
  });

  it('renders messages from different senders', () => {
    render(
      <MessageThread
        messages={mockMessages}
        currentUser={{ id: 'user-1', name: 'User', image: null, role: 'user' }}
      />
    );

    expect(screen.getByText('Hello, I need help with my claim')).toBeInTheDocument();
    expect(screen.getByText('Hi John, I am here to help')).toBeInTheDocument();
  });

  it('shows agent badge for agent messages', () => {
    render(
      <MessageThread
        messages={mockMessages}
        currentUser={{ id: 'user-1', name: 'User', image: null, role: 'user' }}
      />
    );

    // Multiple agent messages may show multiple badges
    const badges = screen.getAllByText('Agent');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows sender name for other users messages', () => {
    render(
      <MessageThread
        messages={mockMessages}
        currentUser={{ id: 'user-1', name: 'User', image: null, role: 'user' }}
      />
    );

    // Agent Smith appears multiple times (for each message)
    const names = screen.getAllByText('Agent Smith');
    expect(names.length).toBeGreaterThan(0);
  });

  it('shows internal note indicator for agents', () => {
    render(
      <MessageThread
        messages={mockMessages}
        currentUser={{ id: 'user-1', name: 'User', image: null, role: 'user' }}
        isAgent
      />
    );

    expect(screen.getByText('Internal Note')).toBeInTheDocument();
    expect(screen.getByText('This is an internal note')).toBeInTheDocument();
  });

  it('shows user initials in avatar fallback', () => {
    render(
      <MessageThread
        messages={mockMessages}
        currentUser={{ id: 'user-1', name: 'User', image: null, role: 'user' }}
      />
    );

    // Agent Smith's messages should show 'A' for first letter
    const initials = screen.getAllByText('A');
    expect(initials.length).toBeGreaterThan(0);
  });

  it('shows message timestamps', () => {
    render(
      <MessageThread
        messages={mockMessages}
        currentUser={{ id: 'user-1', name: 'User', image: null, role: 'user' }}
      />
    );

    // Messages have time displayed
    const timeElements = screen.getAllByText(/\d{1,2}:\d{2}/);
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('shows read indicator for own read messages', () => {
    const messagesWithRead = [
      {
        ...mockMessages[0],
        readAt: new Date(),
      },
    ];

    render(
      <MessageThread
        messages={messagesWithRead}
        currentUser={{ id: 'user-1', name: 'User', image: null, role: 'user' }}
      />
    );

    // Check mark should be shown for read messages
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});
