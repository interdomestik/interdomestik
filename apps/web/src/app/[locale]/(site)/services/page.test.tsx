import enCoverageMatrix from '@/messages/en/coverageMatrix.json';
import enServicesPage from '@/messages/en/servicesPage.json';
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
  getTranslations: async (options?: { namespace?: string } | string) => {
    const namespace = typeof options === 'string' ? options : options?.namespace;

    switch (namespace) {
      case 'servicesPage':
        return (key: string) => getTranslationValue(enServicesPage.servicesPage, key);
      case 'servicesPage.meta':
        return (key: string) => getTranslationValue(enServicesPage.servicesPage.meta, key);
      case 'coverageMatrix':
        return (key: string) => getTranslationValue(enCoverageMatrix.coverageMatrix, key);
      default:
        return (key: string) => key;
    }
  },
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

describe('ServicesPage', () => {
  it('renders included help aligned to the published coverage matrix', async () => {
    const ui = await ServicesPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText(enCoverageMatrix.coverageMatrix.title)).toBeInTheDocument();
    expect(
      screen.getAllByText(enCoverageMatrix.coverageMatrix.rows.vehicle.included)
    ).not.toHaveLength(0);
    expect(screen.getByText('Included help before staff-led recovery')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Human triage response within 24 business hours after a completed claim pack, plus dashboard tracking.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Free Start gives you the eligibility check, confidence score, evidence checklist, first complaint letter, timeline, and pack delivery without starting human review.'
      )
    ).toBeInTheDocument();
  });

  it('makes the escalation path explicit before staff-led handling begins', async () => {
    const ui = await ServicesPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText('How staff-led escalation starts')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Staff-led handling begins only after scope review confirms a launch claim, a plausible monetary recovery path, an identifiable counterparty or insurer, and enough evidence for review.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Insurer negotiation, counterparty negotiation, formal mediation, and active recovery follow-up start only after case acceptance and an escalation agreement.'
      )
    ).toBeInTheDocument();
  });

  it('keeps referral boundaries explicit for guidance-only and out-of-scope matters', async () => {
    const ui = await ServicesPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(screen.getByText(enServicesPage.servicesPage.scope.boundary.title)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'Guidance-only and out-of-scope matters do not move into success-fee handling. They stay advisory, self-serve, membership guidance, or referral-only depending on the case.'
      )
    ).not.toHaveLength(0);
    expect(
      screen.getByText(
        'External legal partner action, court filing, expert reports, translations, medical opinions, and other hard costs require separate written opt-in after case acceptance.'
      )
    ).toBeInTheDocument();
  });
});
