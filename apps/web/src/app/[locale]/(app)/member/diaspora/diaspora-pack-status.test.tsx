import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { HelpNowCountryPack } from '@/features/help-now/content-packs';

import {
  deriveDiasporaPackStatus,
  DiasporaPackStatusDisclosure,
  type DiasporaPackStatusCopy,
} from './diaspora-pack-status';

const copy: DiasporaPackStatusCopy = {
  boundary: 'Pack exposure does not mean downloaded or ready offline.',
  description: 'Availability follows the current reviewed Help Now pack registry.',
  exposed: 'Exposed',
  title: 'Help Now pack status for this corridor',
  unavailable: 'Unavailable',
};

const countryNames = {
  AL: 'Albania',
  AT: 'Austria',
  BE: 'Belgium',
  CH: 'Switzerland',
  CZ: 'Czechia',
  DE: 'Germany',
  DK: 'Denmark',
  ES: 'Spain',
  FR: 'France',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  MK: 'North Macedonia',
  NL: 'Netherlands',
  NO: 'Norway',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SE: 'Sweden',
  XK: 'Kosovo',
} as const;

describe('deriveDiasporaPackStatus', () => {
  it('keeps first-occurrence route order, removes duplicates, and exposes only accepted packs', () => {
    expect(
      deriveDiasporaPackStatus({
        origin: 'DE',
        destination: 'IT',
        transit: ['MK', 'AT', 'MK'],
      })
    ).toEqual([
      { country: 'DE', disclosure: 'unavailable' },
      { country: 'MK', disclosure: 'exposed' },
      { country: 'AT', disclosure: 'unavailable' },
      { country: 'IT', disclosure: 'unavailable' },
    ]);
  });

  it('fails closed for absent, dark, and unaccepted registry entries', () => {
    const packs: HelpNowCountryPack[] = [
      {
        country: 'DE',
        exposure: 'dark',
        l2SignOff: null,
        marketLabel: 'Germany',
        reviewStatus: 'not_started',
      },
      {
        country: 'MK',
        exposure: 'public',
        l2SignOff: null,
        marketLabel: 'North Macedonia',
        reviewStatus: 'accepted',
      },
      {
        country: 'AT',
        exposure: 'public',
        l2SignOff: {
          reviewer: 'reviewer',
          date: '2026-09-18',
          packHash: 'test-only',
        },
        marketLabel: 'Austria',
        reviewStatus: 'not_started',
      },
    ];

    expect(
      deriveDiasporaPackStatus({ origin: 'DE', destination: 'IT', transit: ['MK', 'AT'] }, packs)
    ).toEqual([
      { country: 'DE', disclosure: 'unavailable' },
      { country: 'MK', disclosure: 'unavailable' },
      { country: 'AT', disclosure: 'unavailable' },
      { country: 'IT', disclosure: 'unavailable' },
    ]);
    expect(deriveDiasporaPackStatus(null, packs)).toEqual([]);
  });

  it('uses first occurrence when endpoints and transit entries repeat', () => {
    expect(
      deriveDiasporaPackStatus({ origin: 'DE', destination: 'IT', transit: ['IT', 'MK', 'DE'] })
    ).toEqual([
      { country: 'DE', disclosure: 'unavailable' },
      { country: 'IT', disclosure: 'unavailable' },
      { country: 'MK', disclosure: 'exposed' },
    ]);
    expect(deriveDiasporaPackStatus({ origin: 'MK', destination: 'MK', transit: [] })).toEqual([
      { country: 'MK', disclosure: 'exposed' },
    ]);
  });

  it('fails closed when registry metadata is duplicated for a country', () => {
    const acceptedPack = {
      country: 'MK',
      exposure: 'public',
      l2SignOff: { reviewer: 'reviewer', date: '2026-09-18', packHash: 'test-only' },
      marketLabel: 'North Macedonia',
      reviewStatus: 'accepted',
    } as const satisfies HelpNowCountryPack;

    expect(
      deriveDiasporaPackStatus({ origin: 'MK', destination: 'IT', transit: [] }, [
        acceptedPack,
        acceptedPack,
      ])
    ).toEqual([
      { country: 'MK', disclosure: 'unavailable' },
      { country: 'IT', disclosure: 'unavailable' },
    ]);
  });
});

describe('DiasporaPackStatusDisclosure', () => {
  it('renders localized country labels and the offline boundary for an explicit corridor', () => {
    render(
      <DiasporaPackStatusDisclosure
        countryNames={countryNames}
        context={{ origin: 'DE', destination: 'IT', transit: ['MK', 'AT', 'MK'] }}
        copy={copy}
      />
    );

    const disclosure = screen.getByTestId('diaspora-pack-status');
    expect(within(disclosure).getByRole('status')).toHaveTextContent(
      'Germany: Unavailable; North Macedonia: Exposed; Austria: Unavailable; Italy: Unavailable'
    );
    expect(within(disclosure).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByTestId('diaspora-pack-status-MK')).toHaveTextContent(
      'North MacedoniaExposed'
    );
    expect(screen.getByTestId('diaspora-pack-status-IT')).toHaveTextContent('ItalyUnavailable');
    expect(disclosure).toHaveTextContent('does not mean downloaded or ready offline');
  });

  it('falls back to the country code when a localized label is missing', () => {
    render(
      <DiasporaPackStatusDisclosure
        countryNames={{}}
        context={{ origin: 'MK', destination: 'IT', transit: [] }}
        copy={copy}
      />
    );

    expect(screen.getByTestId('diaspora-pack-status-MK')).toHaveTextContent('MKExposed');
    expect(screen.getByTestId('diaspora-pack-status-IT')).toHaveTextContent('ITUnavailable');
  });

  it('renders nothing without a valid applied corridor', () => {
    const { container } = render(
      <DiasporaPackStatusDisclosure countryNames={countryNames} context={null} copy={copy} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
