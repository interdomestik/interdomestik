import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: Record<string, string | number | null | undefined>) => {
      if (namespace !== 'admin.claims_page.source') {
        return key;
      }

      const translations: Record<string, string> = {
        'origin.portal': 'Portal',
        'origin.agent': 'Agent',
        'origin.admin': 'Admin',
        'origin.api': 'API',
        member: 'Member',
        branch: 'Branch',
        diaspora_badge: 'Diaspora / Green Card',
      };

      if (key === 'diaspora_badge_country') {
        return `Diaspora / Green Card (${values?.country})`;
      }

      return translations[key] ?? key;
    },
}));

import { ClaimOriginBadges } from './ClaimOriginBadges';

describe('ClaimOriginBadges', () => {
  it('renders a diaspora marker alongside the existing origin badge when provenance is available', () => {
    render(
      <ClaimOriginBadges
        originType="portal"
        originDisplayName={null}
        branchCode="KS-A"
        diasporaCountry="DE"
      />
    );

    expect(screen.getByText('Portal')).toBeInTheDocument();
    expect(screen.getByText('Diaspora / Green Card (DE)')).toBeInTheDocument();
  });
});
