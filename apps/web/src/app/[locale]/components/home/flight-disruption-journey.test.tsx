import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { flightJourneyTestMessages } from './flight-journey-test-messages';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => flightJourneyTestMessages),
}));

import { FlightDisruptionJourney } from './flight-disruption-journey';

function chooseTravelState(answer = 'Po') {
  fireEvent.click(screen.getByRole('button', { name: answer }));
}

function chooseDisruption(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('FlightDisruptionJourney', () => {
  it('puts immediate help before the disruption question while travel is active', () => {
    render(<FlightDisruptionJourney />);
    expect(document.getElementById('flight-guidance')).toBeInTheDocument();
    chooseTravelState();
    expect(screen.getByText('Kërkoni ndihmën që ju duhet tani.')).toBeInTheDocument();
    expect(screen.getByText(/Nëse kompania nuk mund ose nuk pranon/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Çfarë problemi patët/i })).toBeInTheDocument();
  });

  it('asks the one-reservation question only for a connection problem', () => {
    render(<FlightDisruptionJourney />);
    chooseTravelState('Jo');
    chooseDisruption('Humba lidhjen ose fluturimi u devijua');
    expect(screen.getByRole('heading', { name: /rezervim të vetëm/i })).toBeInTheDocument();
  });

  it('asks the PIR question only for baggage', () => {
    render(<FlightDisruptionJourney />);
    chooseTravelState('Jo');
    chooseDisruption('Bagazhi u vonua, humbi ose u dëmtua');
    expect(screen.getByRole('heading', { name: /referencë si PIR/i })).toBeInTheDocument();
  });

  it('shows the health-first result immediately for required assistance', () => {
    render(<FlightDisruptionJourney />);
    chooseTravelState();
    chooseDisruption('Ndihma për aftësi të kufizuar ose lëvizshmëri nuk u respektua');
    expect(screen.getByText(/siguria dhe shëndeti vijnë të parat/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /njoftim, arsye/i })).not.toBeInTheDocument();
  });

  it.each([
    ['Fluturimi u vonua', /njoftim, arsye/i],
    ['Fluturimi u anulua ose orari ndryshoi ndjeshëm', /njoftim, arsye/i],
    ['Nuk më lejuan të hipja ose kishte overbooking', /njoftim, arsye/i],
    ['Humba lidhjen ose fluturimi u devijua', /rezervim të vetëm/i],
    ['Bagazhi u vonua, humbi ose u dëmtua', /referencë si PIR/i],
    ['Tjetër ose nuk jam i sigurt', /njoftim, arsye/i],
  ])('routes %s through its one relevant follow-up', (disruption, followUp) => {
    render(<FlightDisruptionJourney />);
    chooseTravelState('Jo');
    chooseDisruption(disruption);
    expect(screen.getByRole('heading', { name: followUp })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nuk jam i sigurt' }));
    expect(screen.getByRole('heading', { name: /Merrni hapin e radhës/i })).toBeInTheDocument();
  });

  it('gives a free airline-first result with official reading and no sales action', () => {
    render(<FlightDisruptionJourney />);
    chooseTravelState('Jo');
    chooseDisruption('Fluturimi u vonua');
    fireEvent.click(screen.getByRole('button', { name: 'Jo' }));

    expect(screen.getByRole('heading', { name: /Merrni hapin e radhës/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /të drejtat zyrtare/i })).toHaveAttribute(
      'href',
      expect.stringContaining('europa.eu')
    );
    expect(screen.getByRole('link', { name: /të drejtat zyrtare/i })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    expect(screen.getByText(/nuk është aktiv.*nuk u krijua asnjë rast/i)).toBeInTheDocument();
    expect(screen.queryByText(/anëtarësim|Free Start|WhatsApp/i)).not.toBeInTheDocument();
  });
});
