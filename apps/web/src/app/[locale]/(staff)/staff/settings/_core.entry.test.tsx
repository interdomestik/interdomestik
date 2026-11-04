import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/navigation', () => ({ redirect: hoisted.redirect }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => `${namespace}.${key}`),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: hoisted.getSession } } }));
vi.mock('@/components/auth/profile-form', () => ({
  ProfileForm: ({ user }: { user: { name: string } }) => (
    <div data-testid="profile-form">{user.name}</div>
  ),
}));
vi.mock('@/components/auth/change-password-form', () => ({
  ChangePasswordForm: () => <div data-testid="change-password-form" />,
}));
vi.mock('@/components/settings/language-settings', () => ({
  LanguageSettings: () => <div data-testid="language-settings" />,
}));
vi.mock('@/app/_segment-exports', () => ({
  generateMetadata: vi.fn(),
  generateViewport: vi.fn(),
}));

import type { ReactElement } from 'react';
import { AccountSettingsPage } from '@/components/settings/account-settings-page';
import AgentSettingsPage from '../../../(agent)/agent/settings/_core.entry';
import StaffSettingsPage from './_core.entry';

type Element = ReactElement<{ locale?: string; children?: ReactElement<{ locale?: string }> }>;
const params = Promise.resolve({ locale: 'sq' });

describe('account settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({ user: { name: 'Staff One', image: null } });
  });

  it('lets the signed-in user edit their own profile, password and language', async () => {
    render(await AccountSettingsPage({ locale: 'sq' }));

    expect(screen.getByTestId('profile-form')).toHaveTextContent('Staff One');
    expect(screen.getByTestId('change-password-form')).toBeInTheDocument();
    expect(screen.getByTestId('language-settings')).toBeInTheDocument();
    expect(screen.getByText('settings.profile.sectionTitle')).toBeInTheDocument();
  });

  it('sends a request without a session to the localized login', async () => {
    hoisted.getSession.mockResolvedValue(null);

    await expect(AccountSettingsPage({ locale: 'sq' })).rejects.toThrow('redirect:/sq/login');
  });

  it('mounts the account settings on the staff route behind the staff page-ready marker', async () => {
    const page = (await StaffSettingsPage({ params })) as Element;

    expect(page.type).toBe('div');
    expect((page.props as Record<string, unknown>)['data-testid']).toBe('staff-page-ready');
    expect(page.props.children?.type).toBe(AccountSettingsPage);
    expect(page.props.children?.props.locale).toBe('sq');
  });

  it('mounts the same account settings on the agent route', async () => {
    const page = (await AgentSettingsPage({ params })) as Element;

    expect(page.type).toBe(AccountSettingsPage);
    expect(page.props.locale).toBe('sq');
  });
});
