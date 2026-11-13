import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ClaimOpsDetail } from '../../types';
import { ClaimHeader } from './ClaimHeader';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/sq/admin/claims/claim-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../shared/ClaimOriginBadges', () => ({ ClaimOriginBadges: () => null }));
vi.mock('../shared/InfoPill', () => ({ InfoPill: () => null }));

const claim = {
  id: 'claim-1',
  claimNumber: 'CLM-KS-2026-000002',
  code: 'CLM-2',
  memberNumber: 'MEM-2026-000002',
  memberId: 'member-1',
  memberName: 'Member',
  lifecycleStage: 'intake',
  title: 'Vehicle: Parking damage',
  category: 'vehicle',
  createdAt: new Date('2026-11-12T10:00:00Z'),
} as unknown as ClaimOpsDetail;

describe('ClaimHeader copy targets', () => {
  it('gives every labelled copy button a 44px phone target and the compact desktop size', () => {
    render(
      <ClaimHeader
        claim={claim}
        allStaff={[]}
        locale="sq"
        deploymentOrigin="https://ida.example.test"
      />
    );

    const names = [
      'admin.claims_page.header.copy_traceable_link',
      'admin.claims_page.header.copy_canonical_link',
      'admin.claims_page.copy_member_number',
      'admin.claims_page.copy_member_link',
    ];
    for (const name of names) {
      expect(screen.getByRole('button', { name })).toHaveClass(
        'size-11',
        'sm:size-auto',
        'sm:inline-block'
      );
    }
  });

  it('lets the breadcrumb wrap so the larger phone targets never overflow', () => {
    render(
      <ClaimHeader
        claim={claim}
        allStaff={[]}
        locale="sq"
        deploymentOrigin="https://ida.example.test"
      />
    );

    expect(
      screen.getByRole('navigation', { name: 'admin.claims_page.header.breadcrumb' })
    ).toHaveClass('flex-wrap');
  });
});
