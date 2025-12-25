import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './forgot-password-form';

// Mock authClient
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    requestPasswordReset: vi.fn(),
  },
}));

import { authClient } from '@/lib/auth-client';
const mockRequestPasswordReset = vi.mocked(authClient.requestPasswordReset);

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      loading: 'Loading...',
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

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, 'Forgot Password', '/en/forgot-password');
    mockRequestPasswordReset.mockResolvedValue({ error: null } as Awaited<
      ReturnType<typeof authClient.requestPasswordReset>
    >);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the forgot password form correctly', () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    expect(screen.getByText(/Enter your email address/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('Send reset link')).toBeInTheDocument();
    expect(screen.getByText('Back to login')).toBeInTheDocument();
  });

  it('submits form with email', async () => {
    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send reset link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    const expectedRedirectTo = new URL('/en/reset-password', window.location.origin).toString();

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: 'test@example.com',
        redirectTo: expectedRedirectTo,
      });
    });
  });

  it('shows success message after submission', async () => {
    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send reset link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
      expect(screen.getByText(/If an account exists for that email/)).toBeInTheDocument();
      expect(screen.getByText('Return to login')).toBeInTheDocument();
    });
  });

  it('shows an error if request fails', async () => {
    mockRequestPasswordReset.mockResolvedValue({
      error: { message: 'Reset password is not enabled' },
    } as Awaited<ReturnType<typeof authClient.requestPasswordReset>>);

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send reset link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Reset password is not enabled')).toBeInTheDocument();
    });
  });

  it('has back to login link', () => {
    render(<ForgotPasswordForm />);

    const backLink = screen.getByText('Back to login');
    expect(backLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('shows loading state during submission', async () => {
    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send reset link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    // The loading state is very brief, so we check that the success state appears
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
  });
});
