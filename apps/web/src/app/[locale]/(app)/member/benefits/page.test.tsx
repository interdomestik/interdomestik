import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
  getTranslationsMock: vi.fn(async ({ locale }: { locale: string }) => {
    return (key: string) => {
      if (key === 'cta_benefits') {
        return locale === 'mk' ? '10 ПРИДОБИВКИ ОД ЧЛЕНСТВОТО' : '10 MEMBERSHIP BENEFITS';
      }
      return key;
    };
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

import Page from './page';

describe('Member benefits page locale binding', () => {
  it('reads dashboard CTA copy using the route locale', async () => {
    const tree = await Page({
      params: Promise.resolve({ locale: 'mk' }),
    });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('mk');
    expect(hoisted.getTranslationsMock).toHaveBeenCalledWith({
      locale: 'mk',
      namespace: 'dashboard.home_grid',
    });
    expect(screen.getByText('10 ПРИДОБИВКИ ОД ЧЛЕНСТВОТО')).toBeInTheDocument();
  });
});
