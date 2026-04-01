import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setRequestLocaleMock: vi.fn(),
  getTranslationsMock: vi.fn(async (_options?: { locale: string }) => {
    const messages = {
      title: 'Green Card abroad quickstart',
      description: 'Choose the country where the accident happened and follow the first steps.',
      selector: {
        label: 'Choose country',
        hint: 'Use the country where the accident happened.',
        options: {
          DE: 'Germany',
          CH: 'Switzerland',
          AT: 'Austria',
          IT: 'Italy',
        },
      },
      guidance: {
        emergency: 'Emergency numbers',
        firstSteps: 'First steps',
        policeRequired: 'Police report required',
        policeNotRequired: 'Police report usually not required',
        europeanFormAllowed: 'European accident statement allowed',
        notes: 'Additional notes',
      },
      actions: {
        support: 'Contact support now',
        claim: 'Start travel claim',
      },
    };

    return (key: string) =>
      key.split('.').reduce((value: unknown, part: string) => {
        if (!value || typeof value !== 'object') {
          return key;
        }

        return (value as Record<string, unknown>)[part];
      }, messages) ?? key;
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import DiasporaPage from './page';

describe('DiasporaPage', () => {
  it('renders a Green Card quickstart with default country guidance and direct actions', async () => {
    const tree = await DiasporaPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(
      screen.getByRole('heading', { name: 'Green Card abroad quickstart' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('diaspora-selected-country')).toHaveTextContent('Germany');
    expect(screen.getByText('110')).toBeInTheDocument();
    expect(screen.getAllByText('112')).toHaveLength(2);
    expect(screen.getByText('Police report usually not required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contact support now/ })).toHaveAttribute(
      'href',
      'tel:+38349900600'
    );
    expect(screen.getByRole('link', { name: 'Start travel claim' })).toHaveAttribute(
      'href',
      '/member/claims/new?category=travel'
    );
  });

  it('renders country-specific guidance when a supported country is selected', async () => {
    const tree = await DiasporaPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ country: 'IT' }),
    });

    render(tree);

    expect(screen.getByTestId('diaspora-selected-country')).toHaveTextContent('Italy');
    expect(screen.getByText('113')).toBeInTheDocument();
    expect(screen.getByText('115')).toBeInTheDocument();
  });
});
