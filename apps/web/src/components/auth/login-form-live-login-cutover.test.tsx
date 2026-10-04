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

const credentials = { email: 'test@example.com', password: 'password123' };

async function submitCredentials(element: React.ReactElement): Promise<void> {
  render(element);

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: credentials.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: credentials.password } });
  fireEvent.click(screen.getByText('Sign In'));

  await waitFor(() => {
    expect(mockSignInEmail).toHaveBeenCalledTimes(1);
  });
}

describe('LoginForm neutral entry and ida live-login cutover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('');
    mockSignInEmail.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { user: { role: 'user' } } });
  });

  it('submits plain credentials at the neutral entry without a tenant hint', async () => {
    await submitCredentials(<LoginForm />);

    expect(mockSignInEmail).toHaveBeenCalledWith(credentials);
  });

  it('does not promote a booking-context redirect parameter into identity selection', async () => {
    mockSearchParams = new URLSearchParams('default_booking_tenant_id=tenant_ks');

    await submitCredentials(<LoginForm />);

    expect(mockSignInEmail).toHaveBeenCalledWith(credentials);
  });

  it('keeps submitting a deliberate tenantId request as explicit context', async () => {
    mockSearchParams = new URLSearchParams('tenantId=tenant_ks');

    await submitCredentials(<LoginForm />);

    expect(mockSignInEmail).toHaveBeenCalledWith({
      ...credentials,
      additionalData: { tenantId: 'tenant_ks' },
    });
  });

  it('keeps submitting the page-resolved country-host tenant as explicit context', async () => {
    mockSearchParams = new URLSearchParams('default_booking_tenant_id=tenant_mk');

    await submitCredentials(<LoginForm tenantId="tenant_ks" />);

    expect(mockSignInEmail).toHaveBeenCalledWith({
      ...credentials,
      additionalData: { tenantId: 'tenant_ks' },
    });
  });
});
