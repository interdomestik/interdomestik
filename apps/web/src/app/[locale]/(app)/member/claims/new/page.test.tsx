import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  intake: vi.fn((props: Record<string, unknown>) => (
    <div data-testid="claim-draft-intake-props">{JSON.stringify(props)}</div>
  )),
  session: vi.fn(),
  membership: vi.fn(),
  ensureTenant: vi.fn(() => 'tenant-ks'),
  messages: vi.fn(async () => ({ freeStart: { marker: 'page-scoped' } })),
  translations: vi.fn(async () => (key: string) => key),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.translations,
}));
vi.mock('next/navigation', () => ({ redirect: hoisted.redirect }));
vi.mock('@/components/claims/claim-draft-intake', () => ({
  ClaimDraftIntake: (props: Record<string, unknown>) => hoisted.intake(props),
}));
vi.mock('@/components/claims/claim-wizard', () => ({
  ClaimWizard: () => <div data-testid="forbidden-claim-wizard" />,
}));
vi.mock('@/components/shell/session', () => ({ getSessionSafe: hoisted.session }));
vi.mock('@/i18n/messages', () => ({ loadMessagesForNamespaces: hoisted.messages }));
vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  hasActiveMembership: hoisted.membership,
}));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: hoisted.ensureTenant }));
vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href = '#' }: { children: React.ReactNode; href?: string }) => (
    <a href={typeof href === 'string' && href.startsWith('/') ? `/en${href}` : href}>{children}</a>
  ),
}));

import NewClaimPage from './page';
import { resolveClaimStartHandoff, resolveNeutralOtpHost } from './_core.entry';

describe('NewClaimPage dormant draft intake', () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.session.mockResolvedValue({ user: { id: 'member-1', tenantId: 'tenant-ks' } });
    hoisted.membership.mockResolvedValue(true);
  });

  it('normalizes the accepted diaspora handoff only', () => {
    expect(
      resolveClaimStartHandoff({
        source: 'diaspora-green-card',
        country: 'IT',
        incidentLocation: 'abroad',
      })
    ).toEqual({ source: 'diaspora-green-card', country: 'IT', incidentLocation: 'abroad' });
    expect(
      resolveClaimStartHandoff({
        source: 'diaspora-green-card',
        country: 'FR',
        incidentLocation: 'abroad',
      })
    ).toBeNull();
  });

  it.each([
    ['front-door.localhost:3000', 'front-door.localhost:3000'],
    ['https://front-door.localhost:3000', 'front-door.localhost:3000'],
    ['https://front-door.localhost:3000/path', null],
  ])('normalizes only an accepted configured IDA host: %s', (configured, expected) => {
    vi.stubEnv('IDA_HOST', configured);
    expect(resolveNeutralOtpHost()).toBe(expected);
  });

  it('preserves route context and renders no ClaimWizard for an active member', async () => {
    vi.stubEnv('IDA_HOST', 'https://front-door.localhost:3000');
    const handoffContext = {
      source: 'diaspora-green-card',
      country: 'IT',
      incidentLocation: 'abroad',
    } as const;
    const tree = await NewClaimPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ category: 'travel', ...handoffContext }),
    });
    render(tree);
    expect(hoisted.session).toHaveBeenCalledWith('MemberNewClaimPage');
    expect(hoisted.translations).toHaveBeenCalledWith({ locale: 'en', namespace: 'claims' });
    expect(hoisted.membership).toHaveBeenCalledWith('member-1', 'tenant-ks');
    expect(hoisted.intake).toHaveBeenCalledWith({
      freeStartMessages: { freeStart: { marker: 'page-scoped' } },
      handoffContext,
      initialCategory: 'travel',
      locale: 'en',
      neutralOtpHost: 'front-door.localhost:3000',
      tenantId: 'tenant-ks',
    });
    expect(screen.getByTestId('new-claim-page-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('forbidden-claim-wizard')).not.toBeInTheDocument();
  });

  it('preserves the unauthenticated redirect', async () => {
    hoisted.session.mockResolvedValueOnce(null);
    await expect(
      NewClaimPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(hoisted.redirect).toHaveBeenCalledWith('/en/login');
  });

  it('preserves the active-membership gate and localized pricing link', async () => {
    hoisted.membership.mockResolvedValueOnce(false);
    const tree = await NewClaimPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });
    render(tree);
    expect(screen.getByTestId('new-claim-page-ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'gate.view_plans' })).toHaveAttribute(
      'href',
      '/en/pricing'
    );
    expect(hoisted.intake).not.toHaveBeenCalled();
    expect(hoisted.messages).not.toHaveBeenCalled();
  });
});
