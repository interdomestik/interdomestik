import { PADDLE_PRICES } from '@/config/paddle';
import * as paddleLib from '@interdomestik/domain-membership-billing/paddle';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingTable } from './pricing-table';

// Mock dependencies
import { cloneElement, isValidElement, MouseEventHandler, ReactElement, ReactNode } from 'react';
const mockRouterPush = vi.fn();
const { mockToastError, mockGetCookie } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockGetCookie: vi.fn(),
}));
let mockLocale = 'en';

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
    asChild,
    ...props
  }: {
    children: ReactNode;
    onClick?: MouseEventHandler;
    disabled?: boolean;
    asChild?: boolean;
    [key: string]: unknown;
  }) =>
    asChild && isValidElement(children) ? (
      cloneElement(children as ReactElement, props)
    ) : (
      <button onClick={onClick} disabled={disabled} {...props}>
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
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  usePathname: () => '/',
  useRouter: () => ({ push: mockRouterPush }),
  getPathname: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => mockLocale,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock('cookies-next', () => ({
  getCookie: mockGetCookie,
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
    vi.unstubAllEnvs();
    mockRouterPush.mockReset();
    mockToastError.mockReset();
    mockGetCookie.mockReset();
    mockLocale = 'en';
    process.env.NEXT_PUBLIC_PILOT_MODE = originalPilotMode;
    window.history.replaceState({}, '', '/pricing');
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(
      mockPaddle as unknown as import('@paddle/paddle-js').Paddle
    );
  });

  it('marks the query-selected plan card for continuity after hydration', async () => {
    window.history.replaceState({}, '', '/pricing?plan=family');
    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('plan-card-family')).toHaveAttribute('data-selected-plan', '1');
    });
    expect(screen.getByTestId('plan-card-standard')).toHaveAttribute('data-selected-plan', '0');
  });

  it('renders plans correctly', () => {
    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

    expect(screen.queryByText('basic.name')).toBeNull();
    expect(screen.queryByText('monthly')).toBeNull();
    expect(screen.queryByText('yearly')).toBeNull();
    expect(screen.getByText('standard.name')).toBeDefined();
    expect(screen.getByText('family.name')).toBeDefined();
    expect(screen.getByText('business.name')).toBeDefined();
    expect(screen.getAllByText('€20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€95').length).toBeGreaterThan(0);
  });

  it('initiates checkout on button click', async () => {
    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        tenantId="tenant_ks"
      />
    );

    // Find the Join Now button for standard plan (now at index 0)
    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]); // Standard plan

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([{ priceId: PADDLE_PRICES.standard.yearly, quantity: 1 }]),
          customer: { email: 'test@example.com' },
          customData: {
            acquisitionSource: 'self_serve_web',
            tenantId: 'tenant_ks',
            userId: 'user-123',
          },
          settings: expect.objectContaining({
            successUrl: expect.stringContaining('/en/member/membership/success'),
            locale: 'en',
          }),
        })
      );
    });
  });

  it('preserves agent and marketing attribution in checkout customData when available', async () => {
    mockGetCookie.mockReturnValue('agent-42');
    window.history.replaceState(
      {},
      '',
      '/pricing?utm_source=google&utm_medium=cpc&utm_campaign=funnel&utm_content=hero'
    );

    render(
      <PricingTable
        userId="user-123"
        email="test@example.com"
        billingTestMode={false}
        tenantId="tenant_mk"
      />
    );

    fireEvent.click(screen.getAllByText('cta')[0]);

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          customData: expect.objectContaining({
            acquisitionSource: 'self_serve_web',
            agentId: 'agent-42',
            tenantId: 'tenant_mk',
            utmSource: 'google',
            utmMedium: 'cpc',
            utmCampaign: 'funnel',
            utmContent: 'hero',
          }),
        })
      );
    });
  });

  it('opens a self-serve confirmation for anonymous standard plan before continuing to register', async () => {
    render(<PricingTable billingTestMode={false} />);

    const standardCta = screen.getByTestId('plan-cta-standard');
    expect(standardCta.tagName).toBe('BUTTON');

    fireEvent.click(standardCta);

    const confirmation = screen.getByTestId('pricing-precheckout-confirmation');
    expect(confirmation).toBeInTheDocument();
    expect(within(confirmation).getByText('joinSecurely')).toBeInTheDocument();
    expect(within(confirmation).getByText('standard.name')).toBeInTheDocument();
    expect(within(confirmation).getByText('€20')).toBeInTheDocument();
    expect(within(confirmation).getByText('preCheckout.responsePromise')).toBeInTheDocument();
    expect(within(confirmation).getByText('disclaimers.eyebrow')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    expect(mockRouterPush).toHaveBeenCalledWith('/register?plan=standard');
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
  });

  it('opens a self-serve confirmation for anonymous family plan before continuing to register', async () => {
    render(<PricingTable billingTestMode={false} />);

    fireEvent.click(screen.getByTestId('plan-cta-family'));

    const confirmation = screen.getByTestId('pricing-precheckout-confirmation');
    expect(confirmation).toBeInTheDocument();
    expect(within(confirmation).getByText('family.name')).toBeInTheDocument();
    expect(within(confirmation).getByText('€35')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('precheckout-continue-cta'));

    expect(mockRouterPush).toHaveBeenCalledWith('/register?plan=family');
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
  });

  it('routes anonymous business users to the assisted business entry path', () => {
    render(<PricingTable billingTestMode={false} />);

    const businessCta = screen.getByTestId('plan-cta-business');

    expect(businessCta.tagName).toBe('A');
    expect(businessCta).toHaveAttribute('href', '/business-membership');
  });

  it('keeps mobile-safe touch targets and safe-area spacing on pricing conversion actions', () => {
    render(<PricingTable billingTestMode={false} />);

    expect(screen.getByTestId('pricing-table-root').className).toContain(
      'pb-[max(1.5rem,env(safe-area-inset-bottom))]'
    );
    expect(screen.getByTestId('plan-cta-standard').className).toContain('min-h-[44px]');
    expect(screen.getByTestId('plan-cta-standard').className).toContain('touch-manipulation');

    fireEvent.click(screen.getByTestId('plan-cta-standard'));

    expect(screen.getByTestId('precheckout-continue-cta').className).toContain('min-h-[44px]');
    expect(screen.getByTestId('precheckout-cancel-cta').className).toContain('min-h-[44px]');
  });

  it('moves focus to the pre-checkout confirmation when it opens', async () => {
    render(<PricingTable billingTestMode={false} />);

    fireEvent.click(screen.getByTestId('plan-cta-standard'));

    const confirmation = await screen.findByTestId('pricing-precheckout-confirmation');

    await waitFor(() => {
      expect(confirmation).toHaveFocus();
    });
  });

  it('passes the active locale into Paddle checkout settings', async () => {
    mockLocale = 'de';

    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

    fireEvent.click(screen.getAllByText('cta')[0]);

    await waitFor(() => {
      expect(mockPaddle.Checkout.open).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            locale: 'de',
            successUrl: expect.stringContaining('/de/member/membership/success'),
          }),
        })
      );
    });
  });

  it('handles paddle initialization failure gracefully', async () => {
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Payment system unavailable. Please check configuration.'
      );
    });

    consoleError.mockRestore();
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

  it('keeps billing test success URL contract with test flag first', async () => {
    vi.useFakeTimers();

    try {
      render(<PricingTable userId="user-123" email="test@example.com" billingTestMode />);

      const joinButtons = screen.getAllByText('cta');
      fireEvent.click(joinButtons[0]);

      await vi.runAllTimersAsync();

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/member/membership/success?test=true&priceId=${PADDLE_PRICES.standard.yearly}&planId=standard`
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps plan CTAs disabled while session state is still resolving', () => {
    render(<PricingTable billingTestMode={false} isSessionPending />);

    const joinButtons = screen.getAllByText('cta');
    expect(joinButtons[0]).toBeDisabled();
  });

  it('falls back to simulated checkout in development when client token is missing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', '');
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.useFakeTimers();

    try {
      render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

      const joinButtons = screen.getAllByText('cta');
      fireEvent.click(joinButtons[0]);

      await vi.runAllTimersAsync();

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/member/membership/success?priceId=${PADDLE_PRICES.standard.yearly}&planId=standard`
      );

      expect(mockToastError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      consoleWarn.mockRestore();
    }
  });

  it('treats placeholder Paddle tokens as missing in development fallback mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'test_***');
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.useFakeTimers();

    try {
      render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

      const joinButtons = screen.getAllByText('cta');
      fireEvent.click(joinButtons[0]);

      await vi.runAllTimersAsync();

      expect(mockRouterPush).toHaveBeenCalledWith(
        `/member/membership/success?priceId=${PADDLE_PRICES.standard.yearly}&planId=standard`
      );
      expect(mockToastError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      consoleWarn.mockRestore();
    }
  });

  it('shows a toast in development when a token exists but Paddle init fails', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'test_valid_token_1234567890');
    vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(null);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<PricingTable userId="user-123" email="test@example.com" billingTestMode={false} />);

    const joinButtons = screen.getAllByText('cta');
    fireEvent.click(joinButtons[0]);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Payment system unavailable. Please check configuration.'
      );
    });

    expect(mockRouterPush).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });
});
