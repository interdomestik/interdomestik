import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn(),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      name: 'Member One',
      image: null,
    },
  })),
}));

function renderNull() {
  return null;
}

function mockHeadersModule() {
  return { headers: hoisted.headersMock };
}

function mockTranslationsModule() {
  return {
    getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
      getNamespacedTranslation(options)
    ),
  };
}

function mockRoutingModule() {
  return { redirect: hoisted.redirectMock };
}

function mockAuthModule() {
  return {
    auth: {
      api: {
        getSession: hoisted.getSessionMock,
      },
    },
  };
}

function mockChangePasswordFormModule() {
  return { ChangePasswordForm: renderNull };
}

function mockProfileFormModule() {
  return { ProfileForm: renderNull };
}

function mockLanguageSettingsModule() {
  return { LanguageSettings: renderNull };
}

function mockNotificationSettingsModule() {
  return { NotificationSettings: renderNull };
}

vi.mock('next/headers', mockHeadersModule);

vi.mock('next-intl/server', mockTranslationsModule);

vi.mock('@/i18n/routing', mockRoutingModule);

vi.mock('@/lib/auth', mockAuthModule);

vi.mock('@/components/auth/change-password-form', mockChangePasswordFormModule);

vi.mock('@/components/auth/profile-form', mockProfileFormModule);

vi.mock('@/components/settings/language-settings', mockLanguageSettingsModule);

vi.mock('@/components/settings/notification-settings', mockNotificationSettingsModule);

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
