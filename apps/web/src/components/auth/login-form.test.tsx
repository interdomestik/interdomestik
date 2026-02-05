import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

const mockCanAccessAdmin = vi.fn();
vi.mock('@/actions/admin-access', () => ({
  canAccessAdmin: () => mockCanAccessAdmin(),
}));

// Mock authClient
const mockSignInEmail = vi.fn();
const mockSignInSocial = vi.fn();
const mockGetSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mockSignInEmail(...args),
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
    getSession: () => mockGetSession(),
  },
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
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/en/login',
}));

// Mock router
const mockPush = vi.fn();
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    type,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    type?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) =>
    type === 'submit' ? (
      <button type="submit" disabled={disabled}>
        {children}
      </button>
    ) : (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Checkbox: ({ id, disabled }: { id: string; disabled?: boolean }) => (
    <input type="checkbox" id={id} disabled={disabled} />
  ),
  Input: ({
    id,
    name,
    type,
    required,
    disabled,
  }: {
    id: string;
    name: string;
    type: string;
    required?: boolean;
    disabled?: boolean;
  }) => <input id={id} name={name} type={type} required={required} disabled={disabled} />,
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { user: { role: 'user' } } });
    mockCanAccessAdmin.mockResolvedValue(false);
  });

  it('renders the login form correctly', () => {
    render(<LoginForm />);

    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Remember me')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('submits form with email and password', async () => {
    mockSignInEmail.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { user: { role: 'user' } } });

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByText('Sign In');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/member');
    });
  });

  it('redirects admins to canonical route when access is granted', async () => {
    mockSignInEmail.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { user: { role: 'admin' } } });
    mockCanAccessAdmin.mockResolvedValue(true);

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByText('Sign In');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/overview');
    });
  });

  it('does not redirect admins without access', async () => {
    mockSignInEmail.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { user: { role: 'admin' } } });
    mockCanAccessAdmin.mockResolvedValue(false);

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByText('Sign In');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('An error occurred')).toBeInTheDocument();
    });
  });

  it('displays error on invalid credentials', async () => {
    mockSignInEmail.mockResolvedValue({ error: { message: 'Invalid credentials' } });
    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByText('Sign In');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('shows loading state during submission', async () => {
    mockSignInEmail.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ error: null }), 100))
    );
    mockGetSession.mockResolvedValue({ data: { user: { role: 'user' } } });

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByText('Sign In');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
  });

  it('handles GitHub OAuth sign in', async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' },
      writable: true,
    });

    render(<LoginForm />);

    const githubButton = screen.getByText('GitHub');
    fireEvent.click(githubButton);

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'github',
        callbackURL: 'http://localhost:3000/en/login',
      });
    });

    Object.defineProperty(window, 'location', { value: originalLocation });
  });

  it('has forgot password link', () => {
    render(<LoginForm />);

    const forgotLink = screen.getByText('Forgot password?');
    expect(forgotLink.closest('a')).toHaveAttribute('href', '/forgot-password');
  });

  it('has register link', () => {
    render(<LoginForm />);

    const registerLink = screen.getByText('Register');
    expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
  });
});
