import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './register-form';
import { authClient } from '@/lib/auth-client';

let mockSearchParams = new URLSearchParams('');

// Mock authClient
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: {
      email: vi.fn().mockResolvedValue({ error: null }),
    },
    signIn: {
      social: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
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
      loading: 'Loading...',
      or: 'or',
    };
    return translations[key] || key;
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('');
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
    expect(loginLink).toHaveAttribute('href', '/login?plan=family');
  });

  it('persists deferred tenant-classification flag during signup', async () => {
    render(<RegisterForm tenantId="tenant_ks" tenantClassificationPending />);

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('button', { name: 'Sign Up' }).closest('form')!);

    await vi.waitFor(() =>
      expect(authClient.signUp.email).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'john@example.com',
          name: 'John Doe',
          tenantId: 'tenant_ks',
          tenantClassificationPending: true,
        })
      )
    );
  });
});
