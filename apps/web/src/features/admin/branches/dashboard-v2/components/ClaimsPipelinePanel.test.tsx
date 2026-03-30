import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClaimsPipelinePanel } from './ClaimsPipelinePanel';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    if (namespace === 'admin.branches.pipeline') {
      return (key: string) => {
        const translations: Record<string, string> = {
          title: 'Pipeline i Dëmeve',
          empty: 'Nuk ka dëme aktive në pipeline',
          'statuses.submitted': 'Dorëzuar',
          'statuses.verification': 'Verifikim',
          'statuses.evaluation': 'Vlerësim',
          'statuses.negotiation': 'Negociim',
          'statuses.court': 'Gjykatë',
          'statuses.resolved': 'Zgjidhur',
        };

        return translations[key] ?? `admin.branches.pipeline.${key}`;
      };
    }

    return (key: string) => (namespace ? `${namespace}.${key}` : key);
  },
}));

describe('ClaimsPipelinePanel', () => {
  it('renders localized labels for known claim statuses', () => {
    render(
      <ClaimsPipelinePanel
        pipeline={[
          { status: 'submitted', count: 11 },
          { status: 'verification', count: 4 },
          { status: 'evaluation', count: 5 },
        ]}
      />
    );

    expect(screen.getByText('Dorëzuar')).toBeInTheDocument();
    expect(screen.getByText('Verifikim')).toBeInTheDocument();
    expect(screen.getByText('Vlerësim')).toBeInTheDocument();
  });

  it('falls back to a formatted status label when no translation is available', () => {
    render(<ClaimsPipelinePanel pipeline={[{ status: 'in_review', count: 2 }]} />);

    expect(screen.getByText('in review')).toBeInTheDocument();
  });
});
