import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

const hoisted = vi.hoisted(() => ({
  changePasswordFormMock: vi.fn(() => <div>change-password-form</div>),
  headersMock: vi.fn(async () => new Headers()),
  languageSettingsMock: vi.fn(() => <div>language-settings</div>),
  notificationSettingsMock: vi.fn(() => <div>notification-settings</div>),
  profileFormMock: vi.fn(() => <div>profile-form</div>),
  redirectMock: vi.fn(),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      name: 'Member One',
      image: null,
    },
  })),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
}));

vi.mock('@/i18n/routing', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/components/auth/change-password-form', () => ({
  ChangePasswordForm: () => hoisted.changePasswordFormMock(),
}));

vi.mock('@/components/auth/profile-form', () => ({
  ProfileForm: () => hoisted.profileFormMock(),
}));

vi.mock('@/components/settings/language-settings', () => ({
  LanguageSettings: () => hoisted.languageSettingsMock(),
}));

vi.mock('@/components/settings/notification-settings', () => ({
  NotificationSettings: () => hoisted.notificationSettingsMock(),
}));

import SettingsPage from './_core.entry';

describe('SettingsPage commercial billing terms', () => {
  it('renders the shared annual billing rules in member settings', async () => {
    const tree = await SettingsPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expectCommercialTerms({ sectionTestId: 'settings-billing-terms' });
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });
});
