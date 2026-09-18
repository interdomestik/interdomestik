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
  options: {
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
  },
  title: 'Help Now pack status for this corridor',
  unavailable: 'Unavailable',
};

describe('deriveDiasporaPackStatus', () => {
  it('keeps first-occurrence route order, removes duplicates, and exposes only accepted packs', () => {
    expect(
      deriveDiasporaPackStatus({
        origin: 'DE',
        destination: 'IT',
        transit: ['MK', 'AT', 'MK'],
      })
    ).toEqual([
      { country: 'DE', exposure: 'unavailable' },
      { country: 'MK', exposure: 'exposed' },
      { country: 'AT', exposure: 'unavailable' },
      { country: 'IT', exposure: 'unavailable' },
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
      { country: 'DE', exposure: 'unavailable' },
      { country: 'MK', exposure: 'unavailable' },
      { country: 'AT', exposure: 'unavailable' },
      { country: 'IT', exposure: 'unavailable' },
    ]);
    expect(deriveDiasporaPackStatus(null, packs)).toEqual([]);
  });
});

describe('DiasporaPackStatusDisclosure', () => {
  it('renders localized country labels and the offline boundary for an explicit corridor', () => {
    render(
      <DiasporaPackStatusDisclosure
        context={{ origin: 'DE', destination: 'IT', transit: ['MK', 'AT', 'MK'] }}
        copy={copy}
      />
    );

    const disclosure = screen.getByTestId('diaspora-pack-status');
    expect(within(disclosure).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByTestId('diaspora-pack-status-MK')).toHaveTextContent(
      'North MacedoniaExposed'
    );
    expect(screen.getByTestId('diaspora-pack-status-IT')).toHaveTextContent('ItalyUnavailable');
    expect(disclosure).toHaveTextContent('does not mean downloaded or ready offline');
  });

  it('renders nothing without a valid applied corridor', () => {
    const { container } = render(<DiasporaPackStatusDisclosure context={null} copy={copy} />);

    expect(container).toBeEmptyDOMElement();
  });
});
