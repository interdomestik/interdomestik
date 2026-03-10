import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
}));

import TermsPage from './_core.entry';

describe('TermsPage', () => {
  it('renders the legacy terms sections alongside the shared billing terms', async () => {
    const tree = await TermsPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    render(tree);

    expect(screen.getByText('legal.terms.intro')).toBeInTheDocument();
    expect(screen.getByText('legal.terms.sections.membership')).toBeInTheDocument();
    expect(screen.getByText('legal.terms.sections.services')).toBeInTheDocument();
    expect(screen.getByText('legal.terms.sections.fees')).toBeInTheDocument();
    expectCommercialTerms({ sectionTestId: 'legal-terms-billing-terms' });
  });
});
