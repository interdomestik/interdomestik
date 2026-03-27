import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
  adminClaimsV2PageMock: vi.fn(() => null),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/features/admin/claims/components/AdminClaimsV2Page', () => ({
  default: hoisted.adminClaimsV2PageMock,
}));

import AdminClaimsPage from './page';

describe('AdminClaimsPage', () => {
  it('sets the request locale before rendering the claims surface', async () => {
    const view = await AdminClaimsPage({
      params: Promise.resolve({ locale: 'mk' }),
      searchParams: Promise.resolve({ view: 'list' }),
    });
    renderToStaticMarkup(view);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('mk');
    expect(hoisted.adminClaimsV2PageMock).toHaveBeenCalledTimes(1);
    expect(hoisted.setRequestLocaleMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.adminClaimsV2PageMock.mock.invocationCallOrder[0]
    );
  });
});
