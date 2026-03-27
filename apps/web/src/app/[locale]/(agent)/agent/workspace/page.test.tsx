import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(async () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Hapësira Pro e Agjentit',
      subtitle: 'Mjete të avancuara dhe kontrolle për përdoruesit e avancuar.',
      switch_to_lite: 'Kalo në Lite',
      'cards.leads.title': 'Lead-et (Pro)',
      'cards.leads.headline': 'Menaxho të gjitha',
      'cards.leads.description': 'Filtrim i avancuar, veprime në grup dhe eksporte.',
      'cards.leads.action_text': 'Hap Lead-et',
      'cards.claims.title': 'Radha e kërkesave',
      'cards.claims.headline': 'Procesim',
      'cards.claims.description': 'Mjete të detajuara për shqyrtim dhe vendimmarrje mbi kërkesat.',
      'cards.claims.action_text': 'Hap Radhën',
      'cards.reports.title': 'Raportet',
      'cards.reports.headline': 'Analitikë',
      'cards.reports.description': 'Metrika të performancës dhe raporte komisionesh.',
      'cards.reports.action_text': 'Së shpejti',
    };

    return translations[key] || key;
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

import AgentWorkspacePage from './page';

describe('Agent workspace localization', () => {
  it('renders translated workspace copy instead of hardcoded English', async () => {
    const tree = await AgentWorkspacePage();

    render(tree);

    expect(screen.getByText('Hapësira Pro e Agjentit')).toBeInTheDocument();
    expect(screen.getByText('Kalo në Lite')).toBeInTheDocument();
    expect(screen.getByText('Lead-et (Pro)')).toBeInTheDocument();
    expect(screen.getByText('Hap Lead-et')).toBeInTheDocument();
  });
});
