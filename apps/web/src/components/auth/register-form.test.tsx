import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './register-form';

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
  useSearchParams: () => new URLSearchParams(''),
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
});
