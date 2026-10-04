import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

let mockSearchParams = new URLSearchParams('');
const mockSignInEmail = vi.fn();
const mockSignInSocial = vi.fn();
const mockReadLoginSession = vi.fn();
const mockLocationAssign = vi.fn();

vi.mock('@/components/auth/login-session-client', () => ({
  readLoginSession: () => mockReadLoginSession(),
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mockSignInEmail(...args),
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
  },
}));
vi.mock('@/lib/auth-telemetry', () => ({ emitAuthTelemetryEvent: vi.fn() }));
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    ({ 'auth.login': { email: 'Email', password: 'Password', submit: 'Sign In' } })[namespace]?.[
      key
    ] ?? key,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/en/login',
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    type,
    onClick,
  }: {
    children: React.ReactNode;
    type?: string;
    onClick?: () => void;
  }) =>
    type === 'submit' ? (
      <button type="submit">{children}</button>
    ) : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Checkbox: ({ id }: { id: string }) => <input type="checkbox" id={id} />,
  Input: ({ id, name, type }: { id: string; name: string; type: string }) => (
    <input id={id} name={name} type={type} />
  ),
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

const credentials = { email: 'test@example.com', password: 'password123' };

function setLocation(href: string): void {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { assign: mockLocationAssign, origin: 'http://localhost:3000', href },
  });
}

function submitCredentials(): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: credentials.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: credentials.password } });
  fireEvent.click(screen.getByText('Sign In'));
}

// `default_booking_tenant_id` is booking context: it must stay out of the password identity payload
// while remaining a usable onboarding intent for a new social account.
describe('LoginForm booking context and social onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('');
    mockSignInEmail.mockResolvedValue({ error: null });
    mockReadLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });
    setLocation('http://localhost:3000/en/login');
  });

  it('keeps a redirected booking context in the GitHub onboarding payload only', async () => {
    mockSearchParams = new URLSearchParams('default_booking_tenant_id=tenant_mk');
    setLocation('http://localhost:3000/en/login?default_booking_tenant_id=tenant_mk');

    render(<LoginForm githubOAuthEnabled />);

    fireEvent.click(screen.getByText('GitHub'));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'github',
        callbackURL: 'http://localhost:3000/en/login?default_booking_tenant_id=tenant_mk',
        additionalData: { onboarding: { tenant: 'tenant_mk', mode: 'deferred' } },
      });
    });

    submitCredentials();

    // Booking context never reaches the password identity payload.
    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith(credentials);
    });
  });

  it('omits the GitHub onboarding payload for an unusable booking context', async () => {
    mockSearchParams = new URLSearchParams('default_booking_tenant_id=tenant_evil');
    setLocation('http://localhost:3000/en/login?default_booking_tenant_id=tenant_evil');

    render(<LoginForm githubOAuthEnabled />);

    fireEvent.click(screen.getByText('GitHub'));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'github',
        callbackURL: 'http://localhost:3000/en/login?default_booking_tenant_id=tenant_evil',
      });
    });
  });

  it('keeps page-resolved onboarding intent ahead of a redirected booking context', async () => {
    mockSearchParams = new URLSearchParams('default_booking_tenant_id=tenant_mk');
    setLocation('http://localhost:3000/en/login?default_booking_tenant_id=tenant_mk');

    render(<LoginForm githubOAuthEnabled tenantId="tenant_ks" />);

    fireEvent.click(screen.getByText('GitHub'));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'github',
        callbackURL: 'http://localhost:3000/en/login?default_booking_tenant_id=tenant_mk',
        additionalData: { onboarding: { tenant: 'tenant_ks', mode: 'resolved' } },
      });
    });

    submitCredentials();

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        ...credentials,
        additionalData: { tenantId: 'tenant_ks' },
      });
    });
  });
});
