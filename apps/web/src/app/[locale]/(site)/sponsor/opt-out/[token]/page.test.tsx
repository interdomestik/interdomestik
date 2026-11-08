import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

const domain = vi.hoisted(() => vi.fn());
vi.mock('@interdomestik/domain-membership-billing/sponsors/opt-out', () => ({
  optOutByToken: domain,
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));

describe('public opt-out GET page', () => {
  it.each(['a'.repeat(43), 'invalid', 'a'.repeat(201)])(
    'renders confirmation without any domain call for token %#',
    async token => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      render(await Page({ params: Promise.resolve({ locale: 'en', token }) }));
      expect(screen.getByTestId('public-sponsor-opt-out-page-ready')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'confirm' })).toBeInTheDocument();
      expect(screen.getByText('explanation')).toBeInTheDocument();
      expect(domain).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
