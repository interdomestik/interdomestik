import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  // Stable like next-intl's translator, so the read effect runs only on mount and on retry.
  t: (key: string) => key,
  read: vi.fn(),
  save: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/actions/user-settings', () => ({
  getNotificationPreferences: hoisted.read,
  updateNotificationPreferences: hoisted.save,
}));
vi.mock('@/lib/pwa/push-subscription', () => ({ syncPushSubscription: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => hoisted.t }));
vi.mock('sonner', () => ({ toast: { error: hoisted.toastError, success: vi.fn() } }));

import { NotificationSettings } from './notification-settings';

const STORED = {
  emailClaimUpdates: true,
  emailMarketing: false,
  emailNewsletter: false,
  pushClaimUpdates: false,
  pushMessages: true,
  inAppAll: true,
};

async function expectClosedForm() {
  expect(await screen.findByRole('alert')).toHaveTextContent('notifications.loadError');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'notifications.save' })).not.toBeInTheDocument();
  expect(hoisted.toastError).toHaveBeenCalledWith('notifications.loadError');
}

async function retryOpensStoredValues() {
  hoisted.read.mockResolvedValueOnce({ success: true, preferences: STORED });
  fireEvent.click(screen.getByRole('button', { name: 'tryAgain' }));
  const newsletter = await screen.findByRole('checkbox', {
    name: 'notifications.email.newsletter',
  });
  expect(newsletter).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('button', { name: 'notifications.save' })).toBeEnabled();
  expect(hoisted.read).toHaveBeenCalledTimes(2);
  expect(hoisted.save).not.toHaveBeenCalled();
}

describe('NotificationSettings fails closed on a failed preference read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an alert and no form when the read returns an error, and retries the read', async () => {
    hoisted.read.mockResolvedValueOnce({ success: false, error: 'Unauthorized' });
    render(<NotificationSettings />);

    await expectClosedForm();
    await retryOpensStoredValues();
  });

  it('shows an alert and no form when the read rejects, and retries the read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    hoisted.read.mockRejectedValueOnce(new Error('acceptance_required'));
    render(<NotificationSettings />);

    await expectClosedForm();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load notification preferences:',
      expect.any(Error)
    );
    await retryOpensStoredValues();
    consoleError.mockRestore();
  });
});
