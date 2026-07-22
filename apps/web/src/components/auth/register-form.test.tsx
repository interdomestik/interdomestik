import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './register-form';
import { authClient } from '@/lib/auth-client';

let mockSearchParams = new URLSearchParams('');

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
      submitMicro: 'Your account keeps cases, documents, and history safe. No spam.',
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

  it('renders the complete default registration surface', () => {
    render(<RegisterForm />);
    expect(screen.getByText('Create Account')).toBeInTheDocument();
    expect(screen.getByText('Get started with your account')).toBeInTheDocument();
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('I agree to the Terms of Service')).toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
    expect(screen.getByText('Sign in').closest('a')).toHaveAttribute('href', '/login');
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
    expect(
      screen.getByText('Your account keeps cases, documents, and history safe. No spam.')
    ).toBeInTheDocument();
  });

  it('renders optional GitHub affordances', () => {
    render(<RegisterForm githubOAuthEnabled />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('preserves selected plan in login link continuity', () => {
    mockSearchParams = new URLSearchParams('tenantId=tenant_mk&plan=family');
    render(<RegisterForm />);

    const loginLink = screen.getByText('Sign in').closest('a');
    expect(loginLink).toHaveAttribute('href', '/login?plan=family');
  });

  it('sends only a distinct onboarding selector for email and social registration', async () => {
    render(<RegisterForm tenantId="tenant_ks" tenantClassificationPending githubOAuthEnabled />);

    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));
    await vi.waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalData: { onboarding: { tenant: 'tenant_ks', mode: 'deferred' } },
        })
      )
    );

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
          onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
        })
      )
    );
    expect(authClient.signUp.email).not.toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: expect.anything(),
      })
    );
  });
});
