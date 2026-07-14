import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { injuryJourneyTestMessages } from './injury-journey-test-messages';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => injuryJourneyTestMessages),
}));

import { InjurySafetyJourney } from './injury-safety-journey';

function chooseSafeSource(source: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Jo' }));
  fireEvent.click(screen.getByRole('button', { name: source }));
}

function reachEvidence() {
  chooseSafeSource('Aksident në trafik');
  fireEvent.change(screen.getByLabelText('Shteti ku ndodhi incidenti'), {
    target: { value: 'IT' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Vazhdo' }));
  fireEvent.change(screen.getByLabelText('Shteti i vendbanimit të zakonshëm'), {
    target: { value: 'DE' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Vazhdo' }));
}

describe('InjurySafetyJourney', () => {
  it.each(['Po', 'Nuk jam i sigurt'])('fails %s closed before any commercial action', answer => {
    render(<InjurySafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: answer }));

    expect(screen.getByRole('heading', { name: 'Siguria juaj vjen e para.' })).toBeInTheDocument();
    expect(screen.getByText(/Në BE mund të telefononi 112/i)).toBeInTheDocument();
    expect(screen.queryByText(/Organizo të dhënat/i)).not.toBeInTheDocument();
  });

  it('asks for the source rather than diagnosis after a non-urgent answer', () => {
    render(<InjurySafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Jo' }));

    expect(screen.getByRole('heading', { name: 'Si ndodhi lëndimi?' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(
      screen.queryByLabelText(/diagnoz|pjesë e trupit|simptom|emri i personit/i)
    ).not.toBeInTheDocument();
  });

  it('keeps traffic injury in this tree and separates incident from residence', () => {
    render(<InjurySafetyJourney />);
    chooseSafeSource('Aksident në trafik');

    expect(screen.getByLabelText('Shteti ku ndodhi incidenti')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Shteti ku ndodhi incidenti'), {
      target: { value: 'IT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vazhdo' }));
    expect(screen.getByLabelText('Shteti i vendbanimit të zakonshëm')).toHaveValue('');
  });

  it('shows a useful free result before the explicit intake handoff', () => {
    const onContinue = vi.fn();
    render(<InjurySafetyJourney onContinue={onContinue} />);
    reachEvidence();

    expect(
      screen.getByRole('heading', { name: 'Ruani faktet që mund t’ju duhen.' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Tani fillon intake-i/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Organizo të dhënat e rastit tim' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
