import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { COUNTRY_CODES } from '@interdomestik/domain-country-guidance';
import { describe, expect, it, vi } from 'vitest';
import enDiaspora from '@/messages/en/diaspora.json';
import mkDiaspora from '@/messages/mk/diaspora.json';
import sqDiaspora from '@/messages/sq/diaspora.json';
import srDiaspora from '@/messages/sr/diaspora.json';

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

    const translate = (key: string) =>
      key.split('.').reduce((value: unknown, part: string) => {
        if (!value || typeof value !== 'object') {
          return key;
        }

        return (value as Record<string, unknown>)[part];
      }, messages) ?? key;

    translate.raw = (key: string) => (key === 'corridor' ? corridorProps.copy : key);
    return translate;
  }),
  getSupportContactsMock: vi.fn(() => ({
    phoneE164: '+38349900600',
    phoneDisplay: '+38349900600',
    telHref: 'tel:+38349900600',
    whatsappE164: '+38349900600',
    whatsappHref: 'https://wa.me/38349900600',
  })),
  pathnameMock: vi.fn(() => '/member/diaspora'),
  replaceMock: vi.fn(),
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
  usePathname: hoisted.pathnameMock,
  useRouter: () => ({ replace: hoisted.replaceMock }),
}));

vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: hoisted.getSupportContactsMock,
}));

import DiasporaPage from './page';
import { DiasporaCorridorCapture, type DiasporaCorridorCopy } from './diaspora-corridor-capture';

const corridorNames: Record<string, string> = {
  AT: 'Austria',
  CH: 'Switzerland',
  DE: 'Germany',
  IT: 'Italy',
};

const corridorProps = {
  copy: {
    addTransit: 'Add transit country',
    apply: 'Show corridor summary',
    chooseCountry: 'Choose a country',
    destination: 'Destination',
    origin: 'Origin',
    options: Object.fromEntries(
      COUNTRY_CODES.map(code => [code, corridorNames[code] ?? code])
    ) as DiasporaCorridorCopy['options'],
    preparationOnly: 'Preparation only. This does not start or update a claim.',
    removeTransit: 'Remove transit country {position}',
    summaryTitle: 'Your trip corridor',
    title: 'Prepare your trip corridor',
    transit: 'Transit country {position}',
    transitGroup: 'Transit countries',
    transitHint: 'Add every transit country in travel order.',
  },
  initialContext: null,
};

describe('DiasporaCorridorCapture', () => {
  it('preserves ordered duplicate transit and query state', () => {
    window.history.replaceState({}, '', '/?country=CH');
    render(<DiasporaCorridorCapture {...corridorProps} />);

    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'DE' } });
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'IT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transit country' }));
    fireEvent.change(screen.getByLabelText('Transit country 1'), { target: { value: 'AT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transit country' }));
    fireEvent.change(screen.getByLabelText('Transit country 2'), { target: { value: 'AT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show corridor summary' }));

    expect(hoisted.replaceMock).toHaveBeenCalledWith(
      '/member/diaspora?country=CH&origin=DE&destination=IT&transit=AT&transit=AT'
    );
  });

  it('focuses added transit and shows a bounded summary', async () => {
    const { rerender } = render(<DiasporaCorridorCapture {...corridorProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add transit country' }));
    await waitFor(() => expect(screen.getByLabelText('Transit country 1')).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Transit country 1'), { target: { value: 'AT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove transit country 1' }));
    expect(screen.queryByLabelText('Transit country 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transit country' })).toHaveFocus();

    rerender(
      <DiasporaCorridorCapture
        {...corridorProps}
        initialContext={{ origin: 'DE', destination: 'IT', transit: [] }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Your trip corridor' })).toBeInTheDocument();
    expect(screen.getByTestId('diaspora-corridor-summary')).toHaveTextContent('Germany → Italy');
  });

  it('keeps every locale corridor catalog aligned with the country vocabulary', () => {
    for (const messages of [enDiaspora, sqDiaspora, mkDiaspora, srDiaspora]) {
      expect(Object.keys(messages.diaspora.corridor.options).sort()).toEqual(
        [...COUNTRY_CODES].sort()
      );
    }
  });
});

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
  ] as const)('fails closed without echoing %s country context', async (_case, country) => {
    const tree = await DiasporaPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ country }),
    });

    const invalidRender = render(tree);

    expect(screen.getByTestId('diaspora-country-required')).toBeInTheDocument();
    expect(screen.queryByTestId('diaspora-selected-country')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Prepare vehicle claim' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contact support now/ })).toHaveAttribute(
      'href',
      'tel:+38349900600'
    );

    const neutralTree = await DiasporaPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });
    const neutralRender = render(neutralTree);

    expect(invalidRender.container.innerHTML).toBe(neutralRender.container.innerHTML);
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
    'normalizes an explicit lowercase country independently from the %s interface locale',
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
