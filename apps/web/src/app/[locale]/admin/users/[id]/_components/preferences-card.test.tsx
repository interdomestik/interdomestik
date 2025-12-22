import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreferencesCard } from './preferences-card';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

describe('PreferencesCard', () => {
  it('renders preferences', async () => {
    const mockPrefs = {
      emailClaimUpdates: true,
      emailNewsletter: false,
      emailMarketing: true,
      pushClaimUpdates: false,
      pushMessages: true,
      inAppAll: false,
    };

    const jsx = await PreferencesCard({ preferences: mockPrefs });
    render(jsx);

    expect(screen.getByText('sections.preferences')).toBeInTheDocument();
    expect(screen.getByText('preferences.email_claims')).toBeInTheDocument();
  });

  it('renders unset state', async () => {
    const jsx = await PreferencesCard({ preferences: null });
    render(jsx);

    expect(screen.getByText('labels.preferences_unset')).toBeInTheDocument();
  });
});
