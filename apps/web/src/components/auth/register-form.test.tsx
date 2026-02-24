import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './register-form';

let mockSearchParams = new URLSearchParams('');
const mockPush = vi.fn();
const mockSignUpEmail = vi.fn();
const mockSignInSocial = vi.fn();

// Mock authClient
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: {
      email: (...args: unknown[]) => mockSignUpEmail(...args),
    },
    signIn: {
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
  },
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'auth.register': {
        title: 'Create Account',
        subtitle: 'Get started with your account',
        fullName: 'Full Name',
        email: 'Email',
        password: 'Password',
        confirmPassword: 'Confirm Password',
        terms: 'I agree to the Terms of Service',
        submit: 'Sign Up',
        hasAccount: 'Already have an account?',
        loginLink: 'Sign in',
        'errors.passwordsMismatch': 'Passwords do not match.',
        'errors.missingTenant': 'Tenant context is missing. Please select a tenant to continue.',
        'errors.userExists': 'This email already exists. Please use a different one.',
        'errors.unexpected': 'An unexpected error occurred.',
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
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/en/register',
}));

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('');
    mockSignUpEmail.mockResolvedValue({ error: null });
    mockSignInSocial.mockResolvedValue({});
  });

  it('renders the title and subtitle', () => {
    render(<RegisterForm />);

    expect(screen.getByText('Create Account')).toBeInTheDocument();
    expect(screen.getByText('Get started with your account')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(<RegisterForm />);

    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('renders terms checkbox', () => {
    render(<RegisterForm />);

    expect(screen.getByText('I agree to the Terms of Service')).toBeInTheDocument();
  });

  it('renders GitHub OAuth button', () => {
    render(<RegisterForm />);

    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('has login link for existing users', () => {
    render(<RegisterForm />);

    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
    const loginLink = screen.getByText('Sign in');
    expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('renders submit button', () => {
    render(<RegisterForm />);

    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('shows "or" divider for social login', () => {
    render(<RegisterForm />);

    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('preserves selected plan in login link continuity', () => {
    mockSearchParams = new URLSearchParams('tenantId=tenant_mk&plan=family');
    render(<RegisterForm />);

    const loginLink = screen.getByText('Sign in').closest('a');
    expect(loginLink).toHaveAttribute('href', '/login?tenantId=tenant_mk&plan=family');
  });

  it('shows inline password mismatch cues and blocks submit until corrected', () => {
    mockSearchParams = new URLSearchParams('tenantId=tenant_mk');
    render(<RegisterForm />);

    const fullNameInput = screen.getByLabelText('Full Name');
    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    const submitButton = screen.getByRole('button', { name: 'Sign Up' });

    fireEvent.change(fullNameInput, { target: { value: 'Jane Doe' } });
    fireEvent.change(emailInput, { target: { value: 'jane@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password321' } });

    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(confirmPasswordInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });

    expect(passwordInput).not.toHaveAttribute('aria-invalid', 'true');
    expect(confirmPasswordInput).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Passwords do not match.')).not.toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();
  });

  it('shows a clear alert when tenant context is missing and skips signup', async () => {
    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I agree to the Terms of Service' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Tenant context is missing. Please select a tenant to continue.'
    );
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it('disables controls and shows loading state during signup', async () => {
    mockSearchParams = new URLSearchParams('tenantId=tenant_mk&plan=family');

    let resolveSignUp: ((value: { error: null }) => void) | undefined;
    mockSignUpEmail.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSignUp = resolve as (value: { error: null }) => void;
        })
    );

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I agree to the Terms of Service' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    expect(screen.getByLabelText('Full Name')).toBeDisabled();
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByLabelText('Confirm Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show confirm password' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'GitHub' })).toBeDisabled();

    expect(mockSignUpEmail).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: 'password123',
      name: 'Jane Doe',
      callbackURL: '/login?tenantId=tenant_mk&plan=family',
      tenantId: 'tenant_mk',
    });

    resolveSignUp?.({ error: null });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login?tenantId=tenant_mk&plan=family');
    });
  });

  it('maps duplicate-user signup errors to a clearer message', async () => {
    mockSearchParams = new URLSearchParams('tenantId=tenant_mk');
    mockSignUpEmail.mockResolvedValue({
      error: { message: 'User already exists' },
    });

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I agree to the Terms of Service' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This email already exists. Please use a different one.');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
