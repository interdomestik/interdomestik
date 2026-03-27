import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
  verificationOpsCenterPageMock: vi.fn(() => null),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/features/admin/verification/components/v2/VerificationOpsCenterPage', () => ({
  default: hoisted.verificationOpsCenterPageMock,
}));

import AdminLeadsPage from './page';

describe('AdminLeadsPage', () => {
  it('sets the request locale before rendering the verification surface', async () => {
    const view = await AdminLeadsPage({
      params: Promise.resolve({ locale: 'mk' }),
      searchParams: Promise.resolve({ view: 'queue' }),
    });
    renderToStaticMarkup(view);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('mk');
    expect(hoisted.verificationOpsCenterPageMock).toHaveBeenCalledTimes(1);
    expect(hoisted.setRequestLocaleMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.verificationOpsCenterPageMock.mock.invocationCallOrder[0]
    );
  });
});
