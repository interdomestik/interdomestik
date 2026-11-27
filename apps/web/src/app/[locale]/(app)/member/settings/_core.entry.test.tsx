import '@/test/tenant-transaction.test-support';
import { refuseAcceptance } from '@/test/member-acceptance.test-support';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';
import { getTranslations } from 'next-intl/server';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(
    async () => new Headers({ cookie: 'better-auth.session_token=member-fixture' })
  ),
  redirectMock: vi.fn(),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      role: 'member',
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

vi.mock('@interdomestik/database', () => {
  const db = { query: { user: { findFirst: hoisted.userFindFirstMock } } };
  return {
    db,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: typeof db) => unknown) =>
      callback(db)
    ),
    eq: vi.fn((field, value) => ({ field, value })),
    user: { id: 'user.id', tenantId: 'user.tenantId' },
  };
});

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId, column, condition) => ({ column, condition, tenantId })),
}));

import SettingsPage from './_core.entry';

describe('SettingsPage commercial billing terms', () => {
  it('refuses before protected work when acceptance is missing', async () => {
    refuseAcceptance();
    const tree = await SettingsPage({ params: Promise.resolve({ locale: 'en' }) });
    expect(tree.props).toMatchObject({
      refusal: { ok: false, failure: { code: 'acceptance_required' } },
    });
    expect(hoisted.userFindFirstMock).not.toHaveBeenCalled();
  });

  it.each(['en', 'sq', 'mk', 'sr', 'de'])('renders settings in %s', async locale => {
    const tree = await SettingsPage({
      params: Promise.resolve({ locale }),
    });

    render(tree);

    expect(getTranslations).toHaveBeenCalledWith({ locale, namespace: 'settings' });
    expect(getTranslations).toHaveBeenCalledWith({ locale, namespace: 'commercialTerms' });
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

  it('closes the residence form and offers a retry when the residence-country read fails', async () => {
    hoisted.userFindFirstMock.mockRejectedValueOnce(new Error('db unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const tree = await SettingsPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    // A failed read must not open the form with a blank value that a save would store.
    expect(screen.queryByTestId('residence-country-settings')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'dashboard.settings_page.residence_unavailable'
    );
    expect(screen.getByRole('link', { name: 'common.tryAgain' })).toHaveAttribute(
      'href',
      '/en/member/settings'
    );
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load residence country:',
      expect.any(Error)
    );
    expectCommercialTerms({ sectionTestId: 'settings-billing-terms' });
    consoleError.mockRestore();
  });

  it('treats a missing member row as an unavailable read, not as no stored country', async () => {
    hoisted.userFindFirstMock.mockResolvedValueOnce(undefined as never);

    render(await SettingsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.queryByTestId('residence-country-settings')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'dashboard.settings_page.residence_unavailable'
    );
  });

  it('opens the residence form empty when the member has no stored country', async () => {
    hoisted.userFindFirstMock.mockResolvedValueOnce({ residenceCountry: null } as never);

    render(await SettingsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByTestId('residence-country-settings')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leads with one page heading and names each settings section', async () => {
    render(await SettingsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByRole('heading', { level: 1, name: 'settings.title' })).toBeInTheDocument();
    for (const [id, key] of [
      ['profile', 'profile'],
      ['residence-country-section', 'residenceCountry'],
      ['security', 'security'],
      ['language', 'language'],
      ['notifications', 'notifications'],
    ]) {
      expect(screen.getByRole('region', { name: `settings.${key}.sectionTitle` })).toHaveAttribute(
        'id',
        id
      );
    }
  });
});
