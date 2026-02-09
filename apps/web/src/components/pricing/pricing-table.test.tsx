import { PADDLE_PRICES } from '@/config/paddle';
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

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  redirect: vi.fn(),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
  getPathname: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

describe('PricingTable', () => {
  const mockPaddle = {
    Checkout: {
      open: vi.fn(),
    },
  };
  const originalPilotMode = process.env.NEXT_PUBLIC_PILOT_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PILOT_MODE = originalPilotMode;
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(
      mockPaddle as unknown as import('@paddle/paddle-js').Paddle
    );
  });

  it('renders plans correctly', () => {
    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

    expect(screen.queryByText('basic.name')).toBeNull();
    expect(screen.getByText('standard.name')).toBeDefined();
    expect(screen.getByText('family.name')).toBeDefined();
    expect(screen.getByText('business.name')).toBeDefined();
    expect(screen.getAllByText('€20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€95').length).toBeGreaterThan(0);
  });

  it('initiates checkout on button click', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

    // Find the Join Now button for standard plan (now at index 0)
    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]); // Standard plan

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([{ priceId: PADDLE_PRICES.standard.yearly, quantity: 1 }]),
          customer: { email: 'test@example.com' },
          customData: { userId: 'user-123' },
          settings: expect.objectContaining({
            successUrl: expect.stringContaining('/en/member/membership/success'),
          }),
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

    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

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

  it('blocks checkout when pilot mode freeze is enabled', async () => {
    process.env.NEXT_PUBLIC_PILOT_MODE = 'true';

    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]);

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    });
  });
});
