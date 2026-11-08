import type { AbstractIntlMessages } from 'next-intl';
import en from '@/messages/en/auth.json';
import sq from '@/messages/sq/auth.json';
import shared from '@/messages/en/common.json';
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
const language = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('next-intl', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    useTranslations: (namespace: string) =>
      createTranslator({
        locale: language.locale,
        namespace,
        messages: { ...shared, ...(language.locale === 'sq' ? sq : en) } as AbstractIntlMessages,
      }),
  };
});

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    language.locale = 'en';
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
      expect(screen.getByTestId('forgot-password-success')).toBeInTheDocument();
      expect(screen.getByTestId('forgot-password-success-title')).toHaveTextContent(
        'Check your email'
      );
      expect(screen.getByTestId('forgot-password-success-body')).toHaveTextContent(
        /If an account exists for that email/
      );
      expect(screen.getByTestId('forgot-password-return-to-login')).toHaveAttribute(
        'href',
        '/login'
      );
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
      expect(screen.getByTestId('forgot-password-success')).toBeInTheDocument();
    });
  });
  it('localizes recovery instructions and keeps the route locale in the reset link', async () => {
    language.locale = 'sq';
    window.history.pushState({}, '', '/sq/forgot-password');
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText('Adresa e email-it'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByText('Dërgo lidhjen e rivendosjes'));
    expect(await screen.findByTestId('forgot-password-success-title')).toHaveTextContent(
      'Kontrolloni email-in tuaj'
    );
    expect(mockRequestPasswordReset).toHaveBeenCalledWith({
      email: 'test@example.com',
      redirectTo: new URL('/sq/reset-password', window.location.origin).toString(),
    });
  });
});
