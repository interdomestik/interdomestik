import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageInput } from './message-input';

// Mock sendMessage action removed as it's no longer used directly

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
    const onSendMessage = vi.fn();
    render(<MessageInput onSendMessage={onSendMessage} />);

    expect(screen.getByTestId('message-input')).toBeInTheDocument();
    expect(screen.getByTestId('send-message-button')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByText('Press Ctrl+Enter to send')).toBeInTheDocument();
    // Internal note toggle should not be visible for non-agents
    expect(screen.queryByTestId('internal-note-toggle')).not.toBeInTheDocument();
  });

  it('renders internal note toggle for agents', () => {
    const onSendMessage = vi.fn();
    render(<MessageInput isAgent={true} allowInternal={true} onSendMessage={onSendMessage} />);

    expect(screen.getByTestId('internal-note-toggle')).toBeInTheDocument();
    expect(screen.getByText('Internal note (only visible to staff)')).toBeInTheDocument();
  });

  it('disables send button when message is empty', () => {
    const onSendMessage = vi.fn();
    render(<MessageInput onSendMessage={onSendMessage} />);

    const sendButton = screen.getByTestId('send-message-button');
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when message has content', () => {
    const onSendMessage = vi.fn();
    render(<MessageInput onSendMessage={onSendMessage} />);

    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Hello' } });

    const sendButton = screen.getByTestId('send-message-button');
    expect(sendButton).not.toBeDisabled();
  });

  it('sends message on form submit', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(true);

    render(<MessageInput onSendMessage={onSendMessage} />);

    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Hello world' } });

    const sendButton = screen.getByTestId('send-message-button');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith('Hello world', false);
    });
  });

  it('sends internal note when toggle is checked', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(true);

    render(<MessageInput isAgent={true} allowInternal={true} onSendMessage={onSendMessage} />);

    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: 'Internal note content' } });

    const toggle = screen.getByTestId('internal-note-toggle');
    fireEvent.click(toggle);

    const sendButton = screen.getByTestId('send-message-button');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith('Internal note content', true);
    });
  });

  it('clears input after successful send', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(true);

    render(<MessageInput onSendMessage={onSendMessage} />);

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
    const onSendMessage = vi.fn();
    render(<MessageInput onSendMessage={onSendMessage} />);

    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: '   ' } });

    const sendButton = screen.getByTestId('send-message-button');
    expect(sendButton).toBeDisabled();
  });
});
