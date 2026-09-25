import { vi } from 'vitest';
// Mock dependencies
import { cloneElement, isValidElement, MouseEventHandler, ReactElement, ReactNode } from 'react';
export const mockRouterPush = vi.fn();
const { mockToastError, mockGetCookie } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockGetCookie: vi.fn(),
}));
export const localeState = { value: 'en' };
export const checkoutConfig = {
  entity: 'ks',
  tenantId: 'tenant_ks',
  environment: 'sandbox',
  clientToken: 'test_client_token_ks',
  priceIds: {
    standardYear: 'pri_standard_year',
    familyYear: 'pri_family_year',
    businessYear: 'pri_business_year',
  },
} as const;

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
  useLocale: () => localeState.value,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock('cookies-next', () => ({
  getCookie: mockGetCookie,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    emailOtp: {
      sendVerificationOtp: vi.fn(),
    },
    signIn: {
      emailOtp: vi.fn(),
    },
  },
}));

import { authClient } from '@/lib/auth-client';
import * as paddleLib from '@interdomestik/domain-membership-billing/paddle';
export const mockPaddle = {
  Checkout: {
    open: vi.fn(),
  },
};
const originalPilotMode = process.env.NEXT_PUBLIC_PILOT_MODE;

export function resetPricingTest() {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mockRouterPush.mockReset();
  mockToastError.mockReset();
  mockGetCookie.mockReset();
  localeState.value = 'en';
  vi.mocked(authClient.emailOtp.sendVerificationOtp).mockResolvedValue({
    data: { success: true },
    error: null,
  } as never);
  vi.mocked(authClient.signIn.emailOtp).mockResolvedValue({
    data: { token: 'session-token', user: { id: 'otp-user-1' } },
    error: null,
  } as never);
  process.env.NEXT_PUBLIC_PILOT_MODE = originalPilotMode;
  window.history.replaceState({}, '', '/pricing');
  vi.spyOn(paddleLib, 'getPaddleInstance').mockResolvedValue(
    mockPaddle as unknown as import('@paddle/paddle-js').Paddle
  );
}

export { mockToastError, mockGetCookie };
