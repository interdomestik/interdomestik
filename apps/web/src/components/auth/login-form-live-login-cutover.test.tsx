import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

let mockSearchParams = new URLSearchParams('');
const mockSignInEmail = vi.fn();
const mockGetSession = vi.fn();

vi.mock('@/actions/admin-access', () => ({ canAccessAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: (...args: unknown[]) => mockSignInEmail(...args) },
    getSession: () => mockGetSession(),
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
  Button: ({ children, type }: { children: React.ReactNode; type?: string }) => (
    <button type={type === 'submit' ? 'submit' : 'button'}>{children}</button>
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

describe('LoginForm ida live-login cutover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('default_booking_tenant_id=tenant_ks');
    mockSignInEmail.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { user: { role: 'user' } } });
  });

  it('submits default booking tenant hint after country-host redirect', async () => {
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        additionalData: { tenantId: 'tenant_ks' },
      });
    });
  });
});
