import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

// Mock authClient
const mockSignInEmail = vi.fn();
const mockSignInSocial = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mockSignInEmail(...args),
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
  },
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Welcome Back',
      subtitle: 'Sign in to continue',
      email: 'Email',
      password: 'Password',
      forgotPassword: 'Forgot password?',
      rememberMe: 'Remember me',
      submit: 'Sign In',
      noAccount: "Don't have an account?",
      registerLink: 'Register',
      loading: 'Loading...',
      or: 'or',
    };
    return translations[key] || key;
  },
}));

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        callbackURL: '/dashboard',
      });
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
        callbackURL: 'http://localhost:3000/dashboard',
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
