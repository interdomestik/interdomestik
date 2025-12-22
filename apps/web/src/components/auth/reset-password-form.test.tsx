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
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      loading: 'Loading...',
    };
    return translations[key] || key;
  },
}));

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
    mockToken = 'valid-token';
  });

  it('renders the reset password form when token is present', () => {
    render(<ResetPasswordForm />);

    // Find the title - there might be multiple elements
    const titles = screen.getAllByText('Reset Password');
    expect(titles.length).toBeGreaterThan(0);
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
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
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
});
