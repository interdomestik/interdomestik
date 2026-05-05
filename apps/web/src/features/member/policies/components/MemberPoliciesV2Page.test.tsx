import React from 'react';
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

    expect(screen.getByRole('button', { name: 'View PDF' })).toBeDisabled();
    expect(container.innerHTML).not.toContain('https://cdn.example/policy.pdf');
  });
});
