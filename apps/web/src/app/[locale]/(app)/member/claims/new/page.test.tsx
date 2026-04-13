import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimWizardMock: vi.fn(
    ({
      initialCategory,
      tenantId,
      handoffContext,
    }: {
      initialCategory?: string;
      tenantId?: string | null;
      handoffContext?: unknown;
    }) => (
      <div data-testid="claim-wizard-props">
        {JSON.stringify({
          initialCategory,
          tenantId,
          handoffContext,
        })}
      </div>
    )
  ),
  getSessionSafeMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      tenantId: 'tenant-ks',
    },
  })),
  hasActiveMembershipMock: vi.fn(async () => true),
  ensureTenantIdMock: vi.fn(() => 'tenant-ks'),
  redirectMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('@/components/claims/claim-wizard', () => ({
  ClaimWizard: (props: Parameters<typeof hoisted.claimWizardMock>[0]) =>
    hoisted.claimWizardMock(props),
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  hasActiveMembership: hoisted.hasActiveMembershipMock,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantIdMock,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href = '#' }: { children: React.ReactNode; href?: string }) => {
    const localizedHref =
      typeof href === 'string' && href.startsWith('/') ? `/en${href}` : String(href);

    return <a href={localizedHref}>{children}</a>;
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href = '#' }: { children: React.ReactNode; href?: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import NewClaimPage from './page';
import { resolveClaimStartHandoff } from './_core.entry';

describe('NewClaimPage diaspora claim handoff', () => {
  it('parses diaspora handoff params into normalized claim-start context', () => {
    expect(
      resolveClaimStartHandoff({
        source: 'diaspora-green-card',
        country: 'IT',
        incidentLocation: 'abroad',
      })
    ).toEqual({
      source: 'diaspora-green-card',
      country: 'IT',
      incidentLocation: 'abroad',
    });
  });

  it('ignores incomplete or invalid diaspora handoff params', () => {
    expect(
      resolveClaimStartHandoff({
        source: 'diaspora-green-card',
        country: 'FR',
        incidentLocation: 'abroad',
      })
    ).toBeNull();
  });

  it('passes the normalized handoff context into ClaimWizard', async () => {
    const tree = await NewClaimPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        category: 'travel',
        source: 'diaspora-green-card',
        country: 'IT',
        incidentLocation: 'abroad',
      }),
    });

    render(tree);

    expect(hoisted.getSessionSafeMock).toHaveBeenCalledWith('MemberNewClaimPage');
    expect(hoisted.claimWizardMock).toHaveBeenCalledWith({
      initialCategory: 'travel',
      tenantId: 'tenant-ks',
      handoffContext: {
        source: 'diaspora-green-card',
        country: 'IT',
        incidentLocation: 'abroad',
      },
    });
    expect(screen.getByTestId('claim-wizard-props')).toBeInTheDocument();
  });

  it('routes inactive members to the localized pricing page', async () => {
    hoisted.hasActiveMembershipMock.mockResolvedValueOnce(false);

    const tree = await NewClaimPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByRole('link', { name: 'gate.view_plans' })).toHaveAttribute(
      'href',
      '/en/pricing'
    );
  });
});
