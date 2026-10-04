import type { ComponentProps, ReactNode } from 'react';
import { vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(''),
  emitAuthTelemetryEvent: vi.fn(),
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
  readLoginSession: vi.fn(),
  locationAssign: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/components/auth/login-session-client', () => ({
  readLoginSession: () => mocks.readLoginSession(),
}));

// Mock authClient

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mocks.signInEmail(...args),
      social: (...args: unknown[]) => mocks.signInSocial(...args),
    },
  },
}));

vi.mock('@/lib/auth-telemetry', () => ({
  emitAuthTelemetryEvent: (...args: unknown[]) => mocks.emitAuthTelemetryEvent(...args),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'auth.login': {
        title: 'Welcome Back',
        subtitle: 'Sign in to continue',
        email: 'Email',
        password: 'Password',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        forgotPassword: 'Forgot password?',
        rememberMe: 'Remember me',
        submit: 'Sign In',
        noAccount: "Don't have an account?",
        registerLink: 'Register',
        error: 'An error occurred',
      },
      common: {
        loading: 'Loading...',
        or: 'or',
      },
    };
    return translations[namespace]?.[key] || key;
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => '/en/login',
}));

// Mock router
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({
    push: mocks.push,
  }),
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    type,
    onClick,
    disabled,
  }: Pick<ComponentProps<'button'>, 'children' | 'type' | 'onClick' | 'disabled'>) => (
    <button
      type={type === 'submit' ? 'submit' : 'button'}
      onClick={type === 'submit' ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Checkbox: ({ id, disabled }: { id: string; disabled?: boolean }) => (
    <input type="checkbox" id={id} disabled={disabled} />
  ),
  Input: ({
    id,
    name,
    type,
    required,
    disabled,
  }: Pick<ComponentProps<'input'>, 'id' | 'name' | 'type' | 'required' | 'disabled'>) => (
    <input id={id} name={name} type={type} required={required} disabled={disabled} />
  ),
  Label: ({ children, htmlFor }: { children: ReactNode; htmlFor: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

export const loginFormMocks = mocks;

export function resetLoginFormHarness(): void {
  vi.clearAllMocks();
  mocks.emitAuthTelemetryEvent.mockReset();
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { assign: mocks.locationAssign },
  });
  mocks.searchParams = new URLSearchParams('');
  mocks.readLoginSession.mockResolvedValue({ role: 'user', hasAdminAccess: false });
}

export function fillAndSubmitCredentials(
  email = 'test@example.com',
  password = 'password123'
): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByText('Sign In'));
}

export function setLoginFormLocation(location: Partial<Location>): void {
  Object.defineProperty(globalThis, 'location', { value: location, writable: true });
}
