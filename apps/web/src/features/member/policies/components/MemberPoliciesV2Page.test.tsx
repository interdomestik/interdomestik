import React from 'react';
import type { AbstractIntlMessages } from 'next-intl';
import en from '@/messages/en/membership.json';
import sq from '@/messages/sq/membership.json';

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    getTranslations: vi.fn(async ({ locale, namespace }: { locale: string; namespace: string }) =>
      createTranslator({
        locale,
        namespace,
        messages: {
          membership: {
            policies: locale === 'sq' ? sq.membership.policies : en.membership.policies,
          },
        } as AbstractIntlMessages,
      })
    ),
  };
});
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getPoliciesWithDocumentLinksCore: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/app/[locale]/(app)/member/policies/_core', () => ({
  getPoliciesWithDocumentLinksCore: hoisted.getPoliciesWithDocumentLinksCore,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: () => 'tenant-1',
}));

vi.mock('next/headers', () => ({
  headers: () => new Headers(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

import { MemberPoliciesV2Page } from './MemberPoliciesV2Page';

describe('MemberPoliciesV2Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', tenantId: 'tenant-1' },
    });
  });

  it('does not render legacy raw policy URLs when no authorized document link exists', async () => {
    hoisted.getPoliciesWithDocumentLinksCore.mockResolvedValue([
      {
        policy: {
          id: 'policy-1',
          provider: 'Legacy Carrier',
          policyNumber: 'POL-123',
          fileUrl: 'https://cdn.example/policy.pdf',
        },
        resolvedAnalysis: { summary: 'legacy summary' },
        documentDownloadHref: '',
      },
    ]);

    const tree = await MemberPoliciesV2Page({ locale: 'en' });
    const { container } = render(tree);

    expect(hoisted.getPoliciesWithDocumentLinksCore).toHaveBeenCalledWith({
      authority: expect.any(Object),
      userId: 'user-1',
    });
    expect(screen.getByRole('button', { name: 'View PDF' })).toBeDisabled();
    expect(container.innerHTML).not.toContain('https://cdn.example/policy.pdf');
  });
  it('uses the route locale for the empty state and upload action', async () => {
    hoisted.getPoliciesWithDocumentLinksCore.mockResolvedValue([]);
    render(await MemberPoliciesV2Page({ locale: 'sq' }));
    expect(screen.getByRole('heading', { name: 'Policat e mia' })).toBeInTheDocument();
    expect(screen.getByText('Ende nuk keni ngarkuar polica')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ngarko policën e parë' })).toHaveAttribute(
      'href',
      '/member/policies/upload'
    );
  });
});
