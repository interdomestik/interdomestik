import enDashboard from '@/messages/en/dashboard.json';
import mkDashboard from '@/messages/mk/dashboard.json';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

function getTranslationValue(source: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);

  return typeof value === 'string' ? value : key;
}

function getNamespaceValue(source: unknown, namespace?: string): unknown {
  if (!namespace) {
    return source;
  }

  return namespace.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);
}

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (options?: { locale?: 'en' | 'mk'; namespace?: string } | string) => {
    const locale = typeof options === 'string' ? 'en' : (options?.locale ?? 'en');
    const namespace = typeof options === 'string' ? options : options?.namespace;
    const messages = locale === 'mk' ? mkDashboard : enDashboard;
    const scopedMessages = getNamespaceValue(messages, namespace);

    return (key: string) => getTranslationValue(scopedMessages, key);
  },
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import BenefitsPage from './benefits/page';
import ClaimReportPage from './claim-report/page';
import GreenCardPage from './green-card/page';
import IncidentGuidePage from './incident-guide/page';

describe('Member CTA handoff pages', () => {
  it.each([
    [ClaimReportPage, 'cta_report'],
    [GreenCardPage, 'cta_green_card'],
    [BenefitsPage, 'cta_benefits'],
    [IncidentGuidePage, 'cta_incident'],
  ])('keeps the dashboard CTA title bound to the request locale', async (Component, titleKey) => {
    const tree = await Component({
      params: Promise.resolve({ locale: 'mk' }),
    });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('mk');
    expect(
      screen.getByText(getTranslationValue(mkDashboard.dashboard.home_grid, titleKey))
    ).toBeInTheDocument();
    expect(screen.queryByText('Placeholder content.')).not.toBeInTheDocument();
  });

  it.each([
    [
      'claim report',
      ClaimReportPage,
      'member_cta_pages.claim_report.description',
      'member_cta_pages.claim_report.boundary',
      'member_cta_pages.claim_report.primary',
      '/member/claims/new',
    ],
    [
      'green card',
      GreenCardPage,
      'member_cta_pages.green_card.description',
      'member_cta_pages.green_card.boundary',
      'member_cta_pages.green_card.primary',
      '/member/diaspora',
    ],
    [
      'benefits',
      BenefitsPage,
      'member_cta_pages.benefits.description',
      'member_cta_pages.benefits.boundary',
      'member_cta_pages.benefits.primary',
      '/member/membership',
    ],
    [
      'incident guide',
      IncidentGuidePage,
      'member_cta_pages.incident_guide.description',
      'member_cta_pages.incident_guide.boundary',
      'member_cta_pages.incident_guide.primary',
      '/member/claims/new',
    ],
  ])(
    'renders bounded handoff content for %s instead of a placeholder destination',
    async (_, Component, descriptionKey, boundaryKey, primaryKey, primaryHref) => {
      const tree = await Component({
        params: Promise.resolve({ locale: 'en' }),
      });

      render(tree);

      expect(
        screen.getByText(getTranslationValue(enDashboard.dashboard, descriptionKey))
      ).toBeInTheDocument();
      expect(
        screen.getByText(getTranslationValue(enDashboard.dashboard, boundaryKey))
      ).toBeInTheDocument();

      const primaryLink = screen.getByRole('link', {
        name: getTranslationValue(enDashboard.dashboard, primaryKey),
      });

      expect(primaryLink).toHaveAttribute('href', primaryHref);
      expect(
        screen.getByRole('link', {
          name: getTranslationValue(enDashboard.dashboard, 'member_cta_pages.shared.secondary'),
        })
      ).toHaveAttribute('href', '/member/help');
    }
  );
});
