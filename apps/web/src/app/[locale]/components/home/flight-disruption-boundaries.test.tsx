import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flightJourneyTestMessages } from './flight-journey-test-messages';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => flightJourneyTestMessages),
}));

import { FlightDisruptionJourney } from './flight-disruption-journey';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FlightDisruptionJourney boundaries', () => {
  it('asks for no identity, booking, route, health detail, expense, narrative, or upload', () => {
    render(<FlightDisruptionJourney />);
    const forbidden =
      /emër|booking reference|flight number|pasaport|diagnoz|shumë|përshkruani|ngarko/i;
    expect(screen.queryByRole('textbox', { name: forbidden })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: forbidden })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ngarko|upload|dokument/i)).not.toBeInTheDocument();
  });

  it('keeps every answer out of storage, history, URL, and network', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const pushSpy = vi.spyOn(history, 'pushState');
    const replaceSpy = vi.spyOn(history, 'replaceState');
    const initialHref = window.location.href;

    render(<FlightDisruptionJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Po' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fluturimi u vonua' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nuk jam i sigurt' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialHref);
  });

  it('never gives eligibility, amount, cause, or representation conclusions', () => {
    render(<FlightDisruptionJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Jo' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Fluturimi u anulua ose orari ndryshoi ndjeshëm' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Po' }));
    expect(
      screen.queryByText(/€|kualifikoheni|garant|rrethanë e jashtëzakonshme|ju përfaqësojmë/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Rregullat e BE-së po ndryshojnë/i)).toBeInTheDocument();
  });

  it('moves focus after keyboard activation', () => {
    render(<FlightDisruptionJourney />);
    const answer = screen.getByRole('button', { name: 'Jo' });
    answer.focus();
    fireEvent.click(answer, { detail: 0 });
    expect(screen.getByRole('heading', { name: /Çfarë problemi patët/i })).toHaveFocus();
  });
});
