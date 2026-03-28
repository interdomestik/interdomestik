import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
  getTranslationsMock: vi.fn(async ({ locale }: { locale: string }) => {
    return (key: string) => {
      if (key === 'cta_benefits') {
        return locale === 'mk' ? '10 ПРИДОБИВКИ ОД ЧЛЕНСТВОТО' : '10 MEMBERSHIP BENEFITS';
      }
      if (key === 'cta_incident') {
        return locale === 'mk' ? 'СЕ СЛУЧИ НЕСРЕЌА – ШТО СЕГА?' : 'ACCIDENT? WHAT NOW?';
      }
      return key;
    };
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import BenefitsPage from './page';
import IncidentGuidePage from '../incident-guide/page';

describe('Member CTA pages locale binding', () => {
  it.each([
    [BenefitsPage, '10 ПРИДОБИВКИ ОД ЧЛЕНСТВОТО'],
    [IncidentGuidePage, 'СЕ СЛУЧИ НЕСРЕЌА – ШТО СЕГА?'],
  ])('reads dashboard CTA copy using the route locale', async (Component, expectedText) => {
    const tree = await Component({
      params: Promise.resolve({ locale: 'mk' }),
    });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('mk');
    expect(hoisted.getTranslationsMock).toHaveBeenCalledWith({
      locale: 'mk',
      namespace: 'dashboard.home_grid',
    });
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});
