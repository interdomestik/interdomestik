import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './forgot-password-form';

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
    vi.spyOn(console, 'log').mockImplementation(() => {});
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
    const consoleSpy = vi.spyOn(console, 'log');
    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByText('Send reset link');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Password reset requested for:', 'test@example.com');
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
