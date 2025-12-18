import { authClient } from '@/lib/auth-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileForm } from './profile-form';

// Mock everything needed
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Profile',
      description: 'Update your personal information',
      fullName: 'Full Name',
      fullNamePlaceholder: 'John Doe',
      saveChanges: 'Save Changes',
      saving: 'Saving...',
      success: 'Profile updated',
      error: 'Failed to update profile',
      'Name must be at least 2 characters': 'Name must be at least 2 characters', // Added for the new test assertion
      profileImage: 'Profile Image URL',
      profileImagePlaceholder: 'https://example.com/avatar.jpg',
    };
    return translations[key] || key;
  },
}));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    updateUser: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ProfileForm', () => {
  it('renders correctly with user data', () => {
    render(<ProfileForm user={{ name: 'Test User', image: null }} />);

    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
    expect(screen.getByText('Profile Image URL')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(<ProfileForm user={{ name: '', image: null }} />);

    const submitButton = screen.getByText('Save Changes');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument();
      expect(authClient.updateUser).not.toHaveBeenCalled();
    });
  });

  it('submits valid data', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({ error: null, data: null } as any);

    render(<ProfileForm user={{ name: 'Test User', image: null }} />);

    const input = screen.getByDisplayValue('Test User');
    fireEvent.change(input, { target: { value: 'New Name' } });

    const submitButton = screen.getByText('Save Changes');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(authClient.updateUser).toHaveBeenCalledWith({
        name: 'New Name',
        image: undefined,
      });
    });
  });
});
