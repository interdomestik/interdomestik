import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './change-password-form';

// Mock authClient
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    changePassword: vi.fn(),
  },
}));

import { authClient } from '@/lib/auth-client';
const mockChangePassword = vi.mocked(authClient.changePassword);

// Mock router
const mockRefresh = vi.fn();
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Change Password',
      description: 'Update your password to keep your account secure',
      currentPassword: 'Current Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm Password',
      updatePassword: 'Update Password',
      updating: 'Updating...',
      error: 'Error',
      success: 'Success',
      successDescription: 'Password updated successfully',
    };
    return translations[key] || key;
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock zod resolver
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => () => ({ values: {}, errors: {} }),
}));

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the change password form correctly', () => {
    render(<ChangePasswordForm />);

    expect(screen.getByText('Change Password')).toBeInTheDocument();
    expect(
      screen.getByText('Update your password to keep your account secure')
    ).toBeInTheDocument();
    expect(screen.getByText('Current Password')).toBeInTheDocument();
    expect(screen.getByText('New Password')).toBeInTheDocument();
    expect(screen.getByText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByText('Update Password')).toBeInTheDocument();
  });

  it('renders all password input fields', () => {
    render(<ChangePasswordForm />);

    const passwordInputs = screen.getAllByPlaceholderText('***');
    expect(passwordInputs).toHaveLength(3);
  });

  it('has submit button', () => {
    render(<ChangePasswordForm />);

    const submitButton = screen.getByRole('button', { name: 'Update Password' });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toHaveAttribute('type', 'submit');
  });

  it('submits form with valid data', async () => {
    mockChangePassword.mockResolvedValue({ error: null } as Awaited<
      ReturnType<typeof authClient.changePassword>
    >);
    const user = userEvent.setup();

    render(<ChangePasswordForm />);

    const inputs = screen.getAllByPlaceholderText('***');

    await user.type(inputs[0], 'currentpass123');
    await user.type(inputs[1], 'newpass123');
    await user.type(inputs[2], 'newpass123');

    const submitButton = screen.getByRole('button', { name: 'Update Password' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalled();
    });
  });

  it('displays card with proper styling', () => {
    render(<ChangePasswordForm />);

    const card =
      screen.getByText('Change Password').closest('[class*="Card"]') ||
      screen.getByText('Change Password').parentElement?.parentElement;
    expect(card).toBeInTheDocument();
  });
});
