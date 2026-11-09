import type { AbstractIntlMessages } from 'next-intl';
import en from '@/messages/en/auth.json';
import sq from '@/messages/sq/auth.json';
import shared from '@/messages/en/common.json';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from './reset-password-form';

// Mock authClient
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    resetPassword: vi.fn(),
  },
}));

import { authClient } from '@/lib/auth-client';
const mockResetPassword = vi.mocked(authClient.resetPassword);

// Mock router
const mockPush = vi.fn();
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: mockPush }),
  Link: ({ children, href, ...props }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next-intl
const language = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('next-intl', async () => {
  const { createLocaleTranslationsMock } = await import('@/test/next-intl-locale-test-utils');
  return createLocaleTranslationsMock(
    language,
    () => ({ ...shared, ...(language.locale === 'sq' ? sq : en) }) as AbstractIntlMessages
  );
});

// Mock useSearchParams with a variable that can be changed
let mockToken: string | null = 'valid-token';
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'token' ? mockToken : null),
  }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    language.locale = 'en';
    mockToken = 'valid-token';
  });

  it('renders the reset password form when token is present', () => {
    render(<ResetPasswordForm />);

    // Find the title - there might be multiple elements
    const titles = screen.getAllByText('Reset Password');
    expect(titles.length).toBeGreaterThan(0);
    expect(screen.getByRole('form', { name: 'Reset password form' })).toHaveAttribute(
      'data-hydrated',
      'true'
    );
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
  });

  it('shows error when token is missing', () => {
    mockToken = null;
    render(<ResetPasswordForm />);

    expect(screen.getByText('Invalid or missing reset token.')).toBeInTheDocument();
    expect(screen.getByText('Back to Login')).toBeInTheDocument();
  });

  it('validates password matching', async () => {
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'different' },
    });

    // Find submit button
    const buttons = screen.getAllByRole('button');
    const submitButton = buttons.find(btn => btn.getAttribute('type') === 'submit');
    if (submitButton) {
      fireEvent.click(submitButton);
    }

    await waitFor(() => {
      expect(document.querySelector('#reset-password-form-error')).toHaveTextContent(
        'Passwords do not match'
      );
      expect(mockResetPassword).not.toHaveBeenCalled();
    });
  });

  it('submits reset password request with matching passwords', async () => {
    mockResetPassword.mockResolvedValue({ error: null } as Awaited<
      ReturnType<typeof authClient.resetPassword>
    >);
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpassword123' },
    });

    const buttons = screen.getAllByRole('button');
    const submitButton = buttons.find(btn => btn.getAttribute('type') === 'submit');
    if (submitButton) {
      fireEvent.click(submitButton);
    }

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith(
        { newPassword: 'newpassword123' },
        { query: { token: 'valid-token' } }
      );
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('displays error on failed reset', async () => {
    mockResetPassword.mockResolvedValue({ error: { message: 'Token expired' } } as Awaited<
      ReturnType<typeof authClient.resetPassword>
    >);
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpassword123' },
    });

    const buttons = screen.getAllByRole('button');
    const submitButton = buttons.find(btn => btn.getAttribute('type') === 'submit');
    if (submitButton) {
      fireEvent.click(submitButton);
    }

    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument();
    });
  });

  it('has back to login link when token is missing', () => {
    mockToken = null;
    render(<ResetPasswordForm />);

    const backLink = screen.getByText('Back to Login');
    expect(backLink.closest('a')).toHaveAttribute('href', '/login');
  });
  it('uses Albanian labels and validation instead of English fallbacks', async () => {
    language.locale = 'sq';
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('Fjalëkalimi i ri'), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText('Konfirmoni fjalëkalimin e ri'), {
      target: { value: 'different' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Formulari i rivendosjes së fjalëkalimit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fjalëkalimet nuk përputhen');
    expect(mockResetPassword).not.toHaveBeenCalled();
  });
});
