/**
 * NotificationSettings Component Tests
 *
 * Unit tests for the NotificationSettings component including loading states,
 * user interactions, API integration (mocked), and error handling.
 */

import * as uSettingsActions from '@/actions/user-settings';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { NotificationSettings } from './notification-settings';

type ButtonProps = PropsWithChildren<ComponentPropsWithoutRef<'button'>>;
type DivProps = PropsWithChildren<ComponentPropsWithoutRef<'div'>>;
type HeadingProps = PropsWithChildren<ComponentPropsWithoutRef<'h3'>>;
type ParagraphProps = PropsWithChildren<ComponentPropsWithoutRef<'p'>>;
type LabelProps = PropsWithChildren<ComponentPropsWithoutRef<'label'>>;
type CheckboxProps = ComponentPropsWithoutRef<'button'> & {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

// Mock UI components
vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: ButtonProps) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@interdomestik/ui/components/card', () => ({
  Card: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: HeadingProps) => <h3 {...props}>{children}</h3>,
  CardDescription: ({ children, ...props }: ParagraphProps) => <p {...props}>{children}</p>,
  CardContent: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
}));

vi.mock('@interdomestik/ui/components/checkbox', () => ({
  Checkbox: ({ id, checked, onCheckedChange, ...props }: CheckboxProps) => (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked ?? false}
      onClick={() => onCheckedChange?.(!(checked ?? false))}
      {...props}
    />
  ),
}));

vi.mock('@interdomestik/ui/components/label', () => ({
  Label: ({ children, htmlFor, ...props }: LabelProps) => (
    <label htmlFor={htmlFor} {...props}>
      {children}
    </label>
  ),
}));

vi.mock('@interdomestik/ui/components/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('lucide-react', () => ({
  Bell: () => <span>Bell Icon</span>,
  Mail: () => <span>Mail Icon</span>,
  MessageSquare: () => <span>MessageSquare Icon</span>,
  Smartphone: () => <span>Smartphone Icon</span>,
}));

// Mock server actions
vi.mock('@/actions/user-settings', () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

// Mock next-intl
vi.mock('next-intl', () => {
  const translations: Record<string, string> = {
    'notifications.title': 'Notification Preferences',
    'notifications.description': 'Choose how you want to receive updates.',
    'notifications.save': 'Save Preferences',
    'notifications.saving': 'Saving...',
    'notifications.saved': 'Preferences saved',
    'notifications.savedDescription': 'Your notification preferences have been updated.',
    'notifications.loadError': 'Failed to load preferences',
    'notifications.saveError': 'Failed to save preferences',
    'notifications.email.title': 'Email Notifications',
    'notifications.email.claimUpdates': 'Claim updates',
    'notifications.email.claimUpdatesHint':
      'Receive email notifications when your claim status changes.',
    'notifications.email.newsletter': 'Newsletter',
    'notifications.email.newsletterHint': 'Receive tips and updates about consumer rights.',
    'notifications.email.marketing': 'Promotional emails',
    'notifications.email.marketingHint': 'Receive special offers and promotions.',
    'notifications.push.title': 'Push Notifications',
    'notifications.push.claimUpdates': 'Claim updates',
    'notifications.push.claimUpdatesHint': 'Get instant notifications for important updates.',
    'notifications.push.messages': 'New messages',
    'notifications.push.messagesHint': 'Be notified when an agent sends you a message.',
    'notifications.inApp.title': 'In-App Notifications',
    'notifications.inApp.all': 'All notifications',
    'notifications.inApp.allHint': "Show all notifications in the app's notification center.",
  };
  const t = (key: string) => translations[key] || key;
  return {
    useTranslations: () => t,
  };
});

// Mock sonner toast
const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

describe('NotificationSettings', () => {
  const getNotificationPreferencesMock =
    uSettingsActions.getNotificationPreferences as unknown as Mock;
  const updateNotificationPreferencesMock =
    uSettingsActions.updateNotificationPreferences as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading skeleton while fetching preferences', async () => {
      // Mock delayed response
      getNotificationPreferencesMock.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  preferences: {
                    emailClaimUpdates: true,
                    emailMarketing: false,
                    emailNewsletter: true,
                    pushClaimUpdates: true,
                    pushMessages: true,
                    inAppAll: true,
                  },
                }),
              100
            )
          )
      );

      render(<NotificationSettings />);

      // Should show loading skeleton
      const skeletons = screen
        .getAllByRole('generic')
        .filter(el => el.className.includes('animate-pulse'));
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should hide loading skeleton after preferences load', async () => {
      getNotificationPreferencesMock.mockResolvedValue({
        success: true,
        preferences: {
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        },
      });

      render(<NotificationSettings />);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
      });

      // Should show the actual form
      expect(screen.getByText('Email Notifications')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should toggle checkbox when clicked', async () => {
      getNotificationPreferencesMock.mockResolvedValue({
        success: true,
        preferences: {
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        },
      });

      render(<NotificationSettings />);

      // Wait for actual form content, not just header (header visible during loading)
      await waitFor(() => {
        expect(screen.getByText('Email Notifications')).toBeInTheDocument();
      });

      const marketingCheckbox = screen.getByLabelText('Promotional emails', {
        selector: 'button[role="checkbox"]#email-marketing',
      });

      expect(marketingCheckbox).not.toBeChecked();

      fireEvent.click(marketingCheckbox);

      await waitFor(() => {
        expect(marketingCheckbox).toBeChecked();
      });
    });
  });

  describe('Save Functionality', () => {
    it('should save preferences when save button is clicked', async () => {
      getNotificationPreferencesMock.mockResolvedValue({
        success: true,
        preferences: {
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        },
      });

      updateNotificationPreferencesMock.mockResolvedValue({ success: true });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      const marketingCheckbox = screen.getByLabelText('Promotional emails', {
        selector: 'button[role="checkbox"]#email-marketing',
      });

      fireEvent.click(marketingCheckbox);

      const saveButton = screen.getByText('Save Preferences');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(updateNotificationPreferencesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            emailMarketing: true,
          })
        );
        expect(mockToast.success).toHaveBeenCalledWith('Preferences saved', expect.anything());
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast when loading fails', async () => {
      getNotificationPreferencesMock.mockResolvedValue({
        success: false,
        error: 'Failed to load',
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to load preferences');
      });
    });

    it('should show error toast when save fails', async () => {
      getNotificationPreferencesMock.mockResolvedValue({
        success: true,
        preferences: {
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        },
      });

      updateNotificationPreferencesMock.mockResolvedValue({ success: false, error: 'Failed' });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Preferences');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to save preferences');
      });
    });
  });

  describe('Initial Preferences Prop', () => {
    it('should use initial preferences if provided and NOT fetch', async () => {
      render(
        <NotificationSettings
          initialPreferences={{
            emailClaimUpdates: false,
            emailMarketing: true,
            emailNewsletter: false,
            pushClaimUpdates: false,
            pushMessages: false,
            inAppAll: false,
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
      });

      // Should check that specific checkboxes match prop values immediately
      const marketingCheckbox = screen.getByLabelText('Promotional emails', {
        selector: 'button[role="checkbox"]#email-marketing',
      });
      expect(marketingCheckbox).toBeChecked();

      const claimUpdatesCheckbox = screen.getByLabelText('Claim updates', {
        selector: 'button[role="checkbox"]#email-claim-updates',
      });
      expect(claimUpdatesCheckbox).not.toBeChecked();

      // Ensure fetch wasn't called
      expect(getNotificationPreferencesMock).not.toHaveBeenCalled();
    });
  });
});
