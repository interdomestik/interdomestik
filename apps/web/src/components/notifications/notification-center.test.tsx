import { render, screen } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from './notification-center';

// Mock Novu Inbox
vi.mock('@novu/nextjs', () => ({
  Inbox: ({
    applicationIdentifier,
    subscriberId,
  }: {
    applicationIdentifier: string;
    subscriberId: string;
  }) => (
    <div
      data-testid="novu-inbox"
      data-app-id={applicationIdentifier}
      data-subscriber={subscriberId}
    >
      Novu Inbox
    </div>
  ),
}));

describe('NotificationCenter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('renders Novu Inbox when app ID is set', () => {
    process.env.NEXT_PUBLIC_NOVU_APP_ID = 'test-app-id';

    render(<NotificationCenter subscriberId="user-123" />);

    expect(screen.getByTestId('novu-inbox')).toBeInTheDocument();
    expect(screen.getByTestId('novu-inbox')).toHaveAttribute('data-app-id', 'test-app-id');
    expect(screen.getByTestId('novu-inbox')).toHaveAttribute('data-subscriber', 'user-123');
  });

  it('passes subscriberHash when provided', () => {
    process.env.NEXT_PUBLIC_NOVU_APP_ID = 'test-app-id';

    render(<NotificationCenter subscriberId="user-123" subscriberHash="hash-abc" />);

    expect(screen.getByTestId('novu-inbox')).toBeInTheDocument();
  });

  it('returns null when app ID is not set', () => {
    delete process.env.NEXT_PUBLIC_NOVU_APP_ID;

    const { container } = render(<NotificationCenter subscriberId="user-123" />);

    expect(container.firstChild).toBeNull();
  });
});
