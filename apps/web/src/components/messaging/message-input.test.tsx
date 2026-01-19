import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageInput } from './message-input';

// Mock sendMessage action
vi.mock('@/actions/messages', () => ({
  sendMessage: vi.fn(),
}));

// Import after mocking
import { sendMessage } from '@/actions/messages';
const mockSendMessage = vi.mocked(sendMessage);

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      placeholder: 'Type your message...',
      internalNoteLabel: 'Internal note (only visible to staff)',
      shortcut: 'Press Ctrl+Enter to send',
      sent: 'Message sent',
      sendError: 'Failed to send message',
    };
    return translations[key] || key;
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MessageInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly for regular users', () => {
    render(<MessageInput claimId="claim-1" />);

    expect(screen.getByTestId('message-input')).toBeInTheDocument();
    expect(screen.getByTestId('send-message-button')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByText('Press Ctrl+Enter to send')).toBeInTheDocument();
    // Internal note toggle should not be visible for non-agents
    expect(screen.queryByTestId('internal-note-toggle')).not.toBeInTheDocument();
  });

  it('renders internal note toggle for agents', () => {
    render(<MessageInput claimId="claim-1" allowInternal={true} />);

    expect(screen.getByTestId('internal-note-toggle')).toBeInTheDocument();
    expect(screen.getByText('Internal note (only visible to staff)')).toBeInTheDocument();
  });

  it('disables send button when message is empty', () => {
    render(<MessageInput claimId="claim-1" />);

    const sendButton = screen.getByTestId('send-message-button');
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when message has content', () => {
    render(<MessageInput claimId="claim-1" />);

    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Hello' } });

    const sendButton = screen.getByTestId('send-message-button');
    expect(sendButton).not.toBeDisabled();
  });

  it('sends message on form submit', async () => {
    mockSendMessage.mockResolvedValue({ success: true });
    const onMessageSent = vi.fn();

    render(<MessageInput claimId="claim-1" onMessageSent={onMessageSent} />);

    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Hello world' } });

    const sendButton = screen.getByTestId('send-message-button');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('claim-1', 'Hello world', false);
      expect(onMessageSent).toHaveBeenCalled();
    });
  });

  it('sends internal note when toggle is checked', async () => {
    mockSendMessage.mockResolvedValue({ success: true });

    render(<MessageInput claimId="claim-1" allowInternal={true} />);

    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Internal note content' } });

    const toggle = screen.getByTestId('internal-note-toggle');
    fireEvent.click(toggle);

    const sendButton = screen.getByTestId('send-message-button');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('claim-1', 'Internal note content', true);
    });
  });

  it('clears input after successful send', async () => {
    mockSendMessage.mockResolvedValue({ success: true });

    render(<MessageInput claimId="claim-1" />);

    const input = screen.getByTestId('message-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(input.value).toBe('Hello');

    const sendButton = screen.getByTestId('send-message-button');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('does not send whitespace-only messages', () => {
    render(<MessageInput claimId="claim-1" />);

    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: '   ' } });

    const sendButton = screen.getByTestId('send-message-button');
    expect(sendButton).toBeDisabled();
  });
});
