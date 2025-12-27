import * as paddleLib from '@interdomestik/domain-membership-billing/paddle';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingTable } from './pricing-table';

// Mock dependencies
import { MouseEventHandler, ReactNode } from 'react';

// Mock dependencies
vi.mock('@interdomestik/ui', () => ({
  Card: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Badge: ({ children, className }: { children: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: MouseEventHandler;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Check: () => <span>✓</span>,
  Loader2: () => <span>...</span>,
  ShieldCheck: () => <span>🛡️</span>,
  Users: () => <span>👥</span>,
  Building2: () => <span>🏢</span>,
}));

describe('PricingTable', () => {
  const mockPaddle = {
    Checkout: {
      open: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(
      mockPaddle as unknown as import('@paddle/paddle-js').Paddle
    );
  });

  it('renders plans correctly', () => {
    render(<PricingTable userId="user-123" email="test@example.com" />);

    expect(screen.queryByText('basic.name')).toBeNull();
    expect(screen.getByText('standard.name')).toBeDefined();
    expect(screen.getByText('family.name')).toBeDefined();
    expect(screen.getByText('business.name')).toBeDefined();
    expect(screen.getAllByText('€20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€95').length).toBeGreaterThan(0);
  });

  it('initiates checkout on button click', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(<PricingTable userId="user-123" email="test@example.com" />);

    // Find the Join Now button for standard plan (now at index 0)
    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]); // Standard plan

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([{ priceId: 'pri_standard_year', quantity: 1 }]),
          customer: { email: 'test@example.com' },
          customData: { userId: 'user-123' },
        })
      );
    });

    consoleLog.mockRestore();
  });

  it('handles paddle initialization failure gracefully', async () => {
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(<PricingTable userId="user-123" email="test@example.com" />);

    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        'Payment system unavailable. Please check configuration.'
      );
    });

    alertMock.mockRestore();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });
});
