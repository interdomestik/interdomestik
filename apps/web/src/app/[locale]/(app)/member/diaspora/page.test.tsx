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
        required: {
          title: 'Choose a country to see guidance',
          description:
            'Country-specific emergency numbers and claim preparation appear only after you choose where the accident happened.',
        },
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
        whatsapp: 'Open WhatsApp support',
        claim: 'Prepare vehicle claim',
        selectionRequired:
          'Contact support now, or choose the accident country above before preparing a vehicle claim.',
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
  getSupportContactsMock: vi.fn(() => ({
    phoneE164: '+38349900600',
    phoneDisplay: '+38349900600',
    telHref: 'tel:+38349900600',
    whatsappE164: '+38349900600',
    whatsappHref: 'https://wa.me/38349900600',
  })),
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

vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: hoisted.getSupportContactsMock,
}));

import DiasporaPage from './page';

describe('DiasporaPage', () => {
  it('requires an explicit country before showing guidance or a claim handoff', async () => {
    const tree = await DiasporaPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getSupportContactsMock).toHaveBeenCalledWith({ locale: 'en' });
    expect(
      screen.getByRole('heading', { name: 'Green Card abroad quickstart' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Choose a country to see guidance' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('diaspora-selected-country')).not.toBeInTheDocument();
    expect(screen.queryByText('110')).not.toBeInTheDocument();
    expect(screen.queryByText('Police report usually not required')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contact support now/ })).toHaveAttribute(
      'href',
      'tel:+38349900600'
    );
    expect(screen.getByRole('link', { name: 'Open WhatsApp support' })).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
    expect(screen.queryByRole('link', { name: 'Prepare vehicle claim' })).not.toBeInTheDocument();
  });

  it.each([
    ['empty', ''],
    ['surrounding whitespace', ' DE '],
    ['unsupported', 'FR'],
    ['malformed', 'Germany'],
    ['repeated', ['DE', 'IT'] as string[]],
  ] as const)('fails closed for %s country context', async (_case, country) => {
    const tree = await DiasporaPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ country }),
    });

    render(tree);

    expect(screen.getByTestId('diaspora-country-required')).toBeInTheDocument();
    expect(screen.queryByTestId('diaspora-selected-country')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Prepare vehicle claim' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contact support now/ })).toHaveAttribute(
      'href',
      'tel:+38349900600'
    );
  });

  it('renders country-specific guidance when a supported country is selected', async () => {
    const tree = await DiasporaPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ country: 'IT' }),
    });

    render(tree);

    expect(screen.getByTestId('diaspora-selected-country')).toHaveTextContent('Italy');
    expect(screen.getByRole('link', { name: 'Italy' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Germany' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('113')).toBeInTheDocument();
    expect(screen.getByText('115')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Prepare vehicle claim' })).toHaveAttribute(
      'href',
      '/member/claims/new?category=vehicle&source=diaspora-green-card&country=IT&incidentLocation=abroad'
    );
  });

  // Locale-specific copy is covered by the mounted gate; this unit case proves only that the
  // explicit country code is independent from the interface locale.
  it.each(['en', 'sq', 'mk', 'sr'])(
    'keeps an explicit lowercase country independent from the %s interface locale',
    async locale => {
      const tree = await DiasporaPage({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({ country: 'it' }),
      });

      render(tree);

      expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith(locale);
      expect(screen.getByTestId('diaspora-selected-country')).toHaveTextContent('Italy');
      expect(screen.getByRole('link', { name: 'Prepare vehicle claim' })).toHaveAttribute(
        'href',
        '/member/claims/new?category=vehicle&source=diaspora-green-card&country=IT&incidentLocation=abroad'
      );
    }
  );
});
