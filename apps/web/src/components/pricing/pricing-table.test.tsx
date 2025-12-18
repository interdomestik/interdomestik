import * as paddleLib from '@/lib/paddle';
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

    expect(screen.getByText('Basic')).toBeDefined();
    expect(screen.getByText('Pro')).toBeDefined();
    expect(screen.getByText('€9.99/mo')).toBeDefined();
  });

  it('initiates checkout on button click', async () => {
    render(<PricingTable userId="user-123" email="test@example.com" />);

    // Find the upgrade button (Pro plan)
    const upgradeBtn = screen.getByText('Upgrade to Pro');
    fireEvent.click(upgradeBtn);

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([{ priceId: 'pri_01jk_placeholder_pro', quantity: 1 }]),
          customer: { email: 'test@example.com' },
          customData: { userId: 'user-123' },
        })
      );
    });
  });

  it('handles paddle initialization failure gracefully', async () => {
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<PricingTable userId="user-123" email="test@example.com" />);

    fireEvent.click(screen.getByText('Upgrade to Pro'));

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        'Payment system unavailable. Please check configuration.'
      );
    });

    alertMock.mockRestore();
    consoleError.mockRestore();
  });
});
