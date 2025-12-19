/**
 * NotificationSettings Component Tests
 *
 * Unit tests for the NotificationSettings component including loading states,
 * user interactions, API integration, and error handling.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// Mock fetch
type MockFetchResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

const fetchMock = vi.fn<Promise<MockFetchResponse>, [RequestInfo | URL, RequestInit?]>();
const createMockResponse = (data: unknown, ok = true): MockFetchResponse => ({
  ok,
  json: async () => data,
});

global.fetch = fetchMock as unknown as typeof fetch;

describe('NotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
  });

  describe('Loading State', () => {
    it('should show loading skeleton while fetching preferences', async () => {
      // Mock fetch to delay response
      fetchMock.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    emailClaimUpdates: true,
                    emailMarketing: false,
                    emailNewsletter: true,
                    pushClaimUpdates: true,
                    pushMessages: true,
                    inAppAll: true,
                  }),
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
      fetchMock.mockResolvedValue(
        createMockResponse({
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        })
      );

      render(<NotificationSettings />);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
      });

      // Should show the actual form
      expect(screen.getByText('Email Notifications')).toBeInTheDocument();
      expect(screen.getByText('Push Notifications')).toBeInTheDocument();
      expect(screen.getByText('In-App Notifications')).toBeInTheDocument();
    });
  });

  describe('Default Preferences', () => {
    it('should load and display default preferences', async () => {
      fetchMock.mockResolvedValue(
        createMockResponse({
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        })
      );

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
      });

      // Check that checkboxes have correct default states
      const emailClaimUpdates = screen.getByLabelText('Claim updates', {
        selector: 'button[role="checkbox"]#email-claim-updates',
      });
      const emailMarketing = screen.getByLabelText('Promotional emails', {
        selector: 'button[role="checkbox"]#email-marketing',
      });

      expect(emailClaimUpdates).toBeChecked();
      expect(emailMarketing).not.toBeChecked();
    });
  });

  describe('User Interactions', () => {
    it('should toggle checkbox when clicked', async () => {
      fetchMock.mockResolvedValue(
        createMockResponse({
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        })
      );

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
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

    it('should enable save button after changes', async () => {
      const user = userEvent.setup();

      fetchMock.mockResolvedValue(
        createMockResponse({
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        })
      );

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Preferences');
      expect(saveButton).toBeEnabled();

      const marketingCheckbox = screen.getByLabelText('Promotional emails', {
        selector: 'button[role="checkbox"]#email-marketing',
      });
      await user.click(marketingCheckbox);

      expect(saveButton).toBeEnabled();
    });
  });

  describe('Save Functionality', () => {
    it('should save preferences when save button is clicked', async () => {
      fetchMock
        .mockResolvedValueOnce(
          createMockResponse({
            emailClaimUpdates: true,
            emailMarketing: false,
            emailNewsletter: true,
            pushClaimUpdates: true,
            pushMessages: true,
            inAppAll: true,
          })
        )
        .mockResolvedValueOnce(createMockResponse({ success: true }));

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      const marketingCheckbox = screen.getByLabelText('Promotional emails', {
        selector: 'button[role="checkbox"]#email-marketing',
      });

      fireEvent.click(marketingCheckbox);

      await waitFor(() => {
        expect(marketingCheckbox).toBeChecked();
      });

      const saveButton = screen.getByText('Save Preferences');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Preferences saved', {
          description: 'Your notification preferences have been updated.',
        });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/settings/notifications',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"emailMarketing":true'),
        })
      );
    });

    it('should show saving state while saving', async () => {
      const user = userEvent.setup();

      fetchMock
        .mockResolvedValueOnce(
          createMockResponse({
            emailClaimUpdates: true,
            emailMarketing: false,
            emailNewsletter: true,
            pushClaimUpdates: true,
            pushMessages: true,
            inAppAll: true,
          })
        )
        .mockImplementation(
          () =>
            new Promise(resolve =>
              setTimeout(
                () => resolve(createMockResponse({ success: true })),
                100
              )
            )
        );

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Preferences');
      await user.click(saveButton);

      // Should show saving state
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error toast when loading fails', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to load preferences');
      });
    });

    it('should show error toast when save fails', async () => {
      const user = userEvent.setup();

      fetchMock
        .mockResolvedValueOnce(
          createMockResponse({
            emailClaimUpdates: true,
            emailMarketing: false,
            emailNewsletter: true,
            pushClaimUpdates: true,
            pushMessages: true,
            inAppAll: true,
          })
        )
        .mockResolvedValueOnce(createMockResponse({ error: 'Failed to save' }, false));

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Preferences');
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to save preferences');
      });
    });
  });

  describe('Initial Preferences Prop', () => {
    it('should use initial preferences if provided', async () => {
      fetchMock.mockResolvedValue(
        createMockResponse({
          emailClaimUpdates: false,
          emailMarketing: true,
          emailNewsletter: false,
          pushClaimUpdates: false,
          pushMessages: false,
          inAppAll: false,
        })
      );

      render(
        <NotificationSettings
          initialPreferences={{
            emailClaimUpdates: false,
            emailMarketing: true,
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
      });

      // Should eventually load from API and override initial preferences
      await waitFor(() => {
        const marketingCheckbox = screen.getByLabelText('Promotional emails', {
          selector: 'button[role="checkbox"]#email-marketing',
        });
        expect(marketingCheckbox).toBeChecked();
      });
    });
  });
});
