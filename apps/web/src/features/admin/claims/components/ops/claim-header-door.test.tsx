import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ClaimOpsDetail } from '../../types';
import { ClaimHeader } from './ClaimHeader';
import { copyText } from './clipboard';

vi.mock('./clipboard', () => ({ copyText: vi.fn().mockResolvedValue(true) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/de/admin/claims/claim-1',
  useSearchParams: () => new URLSearchParams('lifecycle=processing&poolAnchor=old'),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it('copies canonical, traceable and member links from the server door rather than the browser origin', async () => {
  const door = 'https://ida.interdomestik.com';
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://staging.interdomestik.com');
  const claim = {
    id: 'claim-1',
    memberId: 'member-1',
    claimNumber: 'CLM-1',
    memberNumber: 'MEM-1',
    title: 'Claim',
    lifecycleStage: 'processing',
    category: 'vehicle',
    createdAt: new Date(),
    memberName: 'Member',
    status: 'submitted',
    originType: 'portal',
  } as ClaimOpsDetail;
  expect(window.location.origin).not.toBe(door);
  render(<ClaimHeader claim={claim} allStaff={[]} locale="en" deploymentOrigin={door} />);
  const copies = [
    ['copy_traceable_link', '/de/admin/claims/number/CLM-1'],
    ['copy_canonical_link', '/de/admin/claims/claim-1'],
    ['copy_member_link', '/de/admin/members/number/MEM-1'],
  ];
  for (const [label, path] of copies) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(copyText).toHaveBeenLastCalledWith(`${door}${path}`));
  }
});
