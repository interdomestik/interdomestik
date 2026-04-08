import enCoverageMatrix from '@/messages/en/coverageMatrix.json';
import enServicesPage from '@/messages/en/servicesPage.json';
import sqCoverageMatrix from '@/messages/sq/coverageMatrix.json';
import sqServicesPage from '@/messages/sq/servicesPage.json';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ServicesPage from './page';

function getTranslationValue(source: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, source);

  return typeof value === 'string' ? value : key;
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (options?: { locale?: 'en' | 'sq'; namespace?: string } | string) => {
    const locale = typeof options === 'string' ? 'en' : (options?.locale ?? 'en');
    const namespace = typeof options === 'string' ? options : options?.namespace;
    const servicesPageMessages =
      locale === 'sq' ? sqServicesPage.servicesPage : enServicesPage.servicesPage;
    const coverageMatrixMessages =
      locale === 'sq' ? sqCoverageMatrix.coverageMatrix : enCoverageMatrix.coverageMatrix;

    switch (namespace) {
      case 'servicesPage':
        return (key: string) => getTranslationValue(servicesPageMessages, key);
      case 'servicesPage.meta':
        return (key: string) => getTranslationValue(servicesPageMessages.meta, key);
      case 'coverageMatrix':
        return (key: string) => getTranslationValue(coverageMatrixMessages, key);
      default:
        return (key: string) => key;
    }
  },
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

async function renderServicesPage(locale: 'en' | 'sq') {
  const ui = await ServicesPage({ params: Promise.resolve({ locale }) });
  render(ui);
}

describe('ServicesPage', () => {
  it('renders included help aligned to the published coverage matrix', async () => {
    await renderServicesPage('en');

    expect(screen.getByTestId('services-commercial-disclaimers')).toBeInTheDocument();
    expect(screen.getByTestId('services-coverage-matrix')).toBeInTheDocument();
    expect(screen.getByText(enCoverageMatrix.coverageMatrix.title)).toBeInTheDocument();
    expect(
      screen.getAllByText(enCoverageMatrix.coverageMatrix.rows.vehicle.included)
    ).not.toHaveLength(0);
    expect(
      screen.getByText(enServicesPage.servicesPage.categories.consultation.title)
    ).toBeInTheDocument();
    expect(
      screen.getByText(enServicesPage.servicesPage.categories.consultation.services[1].description)
    ).toBeInTheDocument();
    expect(
      screen.getByText(enServicesPage.servicesPage.categories.consultation.services[0].description)
    ).toBeInTheDocument();
  });

  it('makes the escalation path explicit before staff-led handling begins', async () => {
    await renderServicesPage('en');

    expect(
      screen.getByText(enServicesPage.servicesPage.categories.expertise.title)
    ).toBeInTheDocument();
    expect(
      screen.getByText(enServicesPage.servicesPage.categories.expertise.services[0].description)
    ).toBeInTheDocument();
    expect(
      screen.getByText(enServicesPage.servicesPage.categories.expertise.services[1].description)
    ).toBeInTheDocument();
  });

  it('keeps referral boundaries explicit for guidance-only and out-of-scope matters', async () => {
    await renderServicesPage('en');

    expect(screen.getByText(enServicesPage.servicesPage.scope.boundary.title)).toBeInTheDocument();
    expect(screen.getAllByText(enServicesPage.servicesPage.scope.boundary.body)).not.toHaveLength(
      0
    );
    expect(
      screen.getByText(enServicesPage.servicesPage.categories.legal.services[0].description)
    ).toBeInTheDocument();
  });

  it('renders the Albanian services trust surfaces from the active locale bundle', async () => {
    await renderServicesPage('sq');

    expect(screen.getByText(sqCoverageMatrix.coverageMatrix.title)).toBeInTheDocument();
    expect(
      screen.getByText(sqServicesPage.servicesPage.disclaimers.freeStart.title)
    ).toBeInTheDocument();
    expect(
      screen.getByText(sqServicesPage.servicesPage.categories.consultation.title)
    ).toBeInTheDocument();
    expect(
      screen.getByText(sqServicesPage.servicesPage.categories.expertise.title)
    ).toBeInTheDocument();
    expect(screen.getByText(sqServicesPage.servicesPage.scope.boundary.title)).toBeInTheDocument();
    expect(
      screen.getAllByText(sqServicesPage.servicesPage.categories.legal.services[1].description)
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole('link', { name: sqServicesPage.servicesPage.cta.primary })
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole('link', { name: sqServicesPage.servicesPage.cta.primary })[0]
    ).toHaveAttribute('href', '/pricing');
  });
});
