import { render, screen } from '@testing-library/react';
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
      tenantId: 'tenant-1',
    },
  })),
  userFindFirstMock: vi.fn(async () => ({ residenceCountry: 'DE' })),
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

function mockResidenceCountrySettingsModule() {
  return {
    ResidenceCountrySettings: ({
      initialResidenceCountry,
    }: {
      initialResidenceCountry?: string;
    }) => <div data-testid="residence-country-settings">{initialResidenceCountry}</div>,
  };
}

vi.mock('next/headers', mockHeadersModule);

vi.mock('next-intl/server', mockTranslationsModule);

vi.mock('@/i18n/routing', mockRoutingModule);

vi.mock('@/lib/auth', mockAuthModule);

vi.mock('@/components/auth/change-password-form', mockChangePasswordFormModule);

vi.mock('@/components/auth/profile-form', mockProfileFormModule);

vi.mock('@/components/settings/language-settings', mockLanguageSettingsModule);

vi.mock('@/components/settings/notification-settings', mockNotificationSettingsModule);

vi.mock('@/components/settings/residence-country-settings', mockResidenceCountrySettingsModule);

vi.mock('@interdomestik/database', () => ({
  db: { query: { user: { findFirst: hoisted.userFindFirstMock } } },
  eq: vi.fn((field, value) => ({ field, value })),
  user: { id: 'user.id', tenantId: 'user.tenantId' },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId, column, condition) => ({ column, condition, tenantId })),
}));

import SettingsPage from './_core.entry';

describe('SettingsPage commercial billing terms', () => {
  it('renders the shared annual billing rules in member settings', async () => {
    const tree = await SettingsPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expectCommercialTerms({ sectionTestId: 'settings-billing-terms' });
    expect(screen.getByTestId('residence-country-settings')).toHaveTextContent('DE');
    expect(hoisted.userFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { residenceCountry: true },
        where: expect.objectContaining({ column: 'user.tenantId', tenantId: 'tenant-1' }),
      })
    );
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });

  it('keeps the settings page renderable when residence-country lookup fails', async () => {
    hoisted.userFindFirstMock.mockRejectedValueOnce(new Error('db unavailable'));

    const tree = await SettingsPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expect(screen.getByTestId('residence-country-settings')).toBeEmptyDOMElement();
    expectCommercialTerms({ sectionTestId: 'settings-billing-terms' });
  });
});
