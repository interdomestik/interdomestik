import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimMessagesPane } from './claim-messages-pane';

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}));

const mockT = (key: string) => {
  const translations: Record<string, string> = {
    'details.messages': 'Messages',
    'details.no_messages': 'No messages yet',
  };
  return translations[key] || key;
};

const mockMessages = [
  { id: 'msg-1', content: 'Hello, I need help with my claim.', sender: { name: 'John Doe' } },
  { id: 'msg-2', content: 'We are reviewing your case.', sender: { name: 'Agent Smith' } },
];

describe('ClaimMessagesPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders messages title', () => {
    render(
      <ClaimMessagesPane
        claimId="claim-123"
        messages={mockMessages}
        currentUserId="user-1"
        t={mockT}
      />
    );
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  it('renders message contents', () => {
    render(
      <ClaimMessagesPane
        claimId="claim-123"
        messages={mockMessages}
        currentUserId="user-1"
        t={mockT}
      />
    );
    expect(screen.getByText('Hello, I need help with my claim.')).toBeInTheDocument();
    expect(screen.getByText('We are reviewing your case.')).toBeInTheDocument();
  });

  it('renders sender names', () => {
    render(
      <ClaimMessagesPane
        claimId="claim-123"
        messages={mockMessages}
        currentUserId="user-1"
        t={mockT}
      />
    );
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Agent Smith')).toBeInTheDocument();
  });

  it('renders empty state when no messages', () => {
    render(
      <ClaimMessagesPane claimId="claim-123" messages={[]} currentUserId="user-1" t={mockT} />
    );
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('handles messages without sender name', () => {
    const messagesWithoutSender = [{ id: 'msg-1', content: 'Anonymous message', sender: null }];
    render(
      <ClaimMessagesPane
        claimId="claim-123"
        messages={messagesWithoutSender}
        currentUserId="user-1"
        t={mockT}
      />
    );
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
