import { ClaimDetailPageLinks } from '@/features/admin/claims/components/detail/ClaimDetailReadControls';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminClaimDetailPage from './page';

vi.mock('@/features/admin/claims/components/AdminClaimDetailV2Page', () => ({
  AdminClaimDetailV2Page: () => null,
}));
vi.mock('@/i18n/routing', async () => ({ Link: (await import('next/link')).default }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const params = Promise.resolve({ id: 'claim-1', locale: 'en' });

describe('admin claim detail search params', () => {
  it('passes only the validated read controls to the detail page', async () => {
    const element = await AdminClaimDetailPage({
      params,
      searchParams: Promise.resolve({
        documentsAfter: 'doc-25',
        staffAfter: 'staff-25',
        staffSearch: '  Alex  ',
        userId: 'another-user',
        tenantId: 'another-tenant',
        role: 'admin',
        branchId: 'another-branch',
      }),
    });
    expect(element.props).toEqual({
      id: 'claim-1',
      locale: 'en',
      search: { documentsAfter: 'doc-25', staffAfter: 'staff-25', staffSearch: 'Alex' },
    });
  });

  it.each([
    ['documentsAfter', { staffAfter: 'staff-25' }],
    ['staffAfter', { documentsAfter: 'doc-25' }],
  ] as const)('opens the first page after clearing %s', async (cursorKey, otherCursor) => {
    const search = { documentsAfter: 'doc-25', staffAfter: 'staff-25', staffSearch: 'Alex' };
    render(await ClaimDetailPageLinks({ claimId: 'claim-1', cursorKey, search, nextCursor: null }));

    const href = screen.getByRole('link', { name: 'first_page' }).getAttribute('href');
    const url = new URL(href!, 'http://localhost');
    const element = await AdminClaimDetailPage({
      params,
      searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
    });

    expect(url.pathname).toBe('/admin/claims/claim-1');
    expect(url.searchParams.has(cursorKey)).toBe(false);
    expect(element.props.search).toEqual({ ...otherCursor, staffSearch: 'Alex' });
  });

  it.each([
    { documentsAfter: ['doc-1', 'doc-2'] },
    { documentsAfter: '' },
    { documentsAfter: 'doc\u0000' },
    { documentsAfter: 'd'.repeat(201) },
    { staffAfter: ['staff-1', 'staff-2'] },
    { staffSearch: 's'.repeat(121) },
    { staffSearch: 'alex\u0000' },
  ])('rejects malformed or repeated read controls', async invalid => {
    await expect(
      AdminClaimDetailPage({ params, searchParams: Promise.resolve(invalid) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
