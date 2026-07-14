import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { injuryJourneyTestMessages } from './injury-journey-test-messages';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => injuryJourneyTestMessages),
}));

import { InjurySafetyJourney } from './injury-safety-journey';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openSource() {
  fireEvent.click(screen.getByRole('button', { name: 'Jo' }));
}

describe('InjurySafetyJourney boundaries', () => {
  it.each([
    ['Problem i dyshuar gjatë trajtimit', 'Kjo kërkon vlerësim specialisti.'],
    ['Sulm ose rrezik tjetër', 'Siguria dhe mbështetja e specializuar vijnë të parat.'],
    ['Nuk jam i sigurt', 'Mund të filloni pa e ditur kategorinë.'],
  ])('keeps %s on a non-commercial referral outcome', (source, outcome) => {
    render(<InjurySafetyJourney />);
    openSource();
    fireEvent.click(screen.getByRole('button', { name: source }));

    expect(screen.getByRole('heading', { name: outcome })).toBeInTheDocument();
    expect(screen.queryByText(/Organizo të dhënat/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Shteti ku ndodhi/i)).not.toBeInTheDocument();
  });

  it('keeps every answer out of storage, history, URL, and network', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const pushSpy = vi.spyOn(history, 'pushState');
    const replaceSpy = vi.spyOn(history, 'replaceState');
    const initialHref = window.location.href;
    const initialState = history.state;

    render(<InjurySafetyJourney />);
    openSource();
    fireEvent.click(screen.getByRole('button', { name: 'Lëndim në punë' }));
    fireEvent.change(screen.getByLabelText('Shteti ku ndodhi incidenti'), {
      target: { value: 'IT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vazhdo' }));
    fireEvent.change(screen.getByLabelText('Shteti i vendbanimit të zakonshëm'), {
      target: { value: 'DE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vazhdo' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialHref);
    expect(history.state).toBe(initialState);
  });

  it('moves focus after keyboard activation and keeps pointer transitions announced', () => {
    render(<InjurySafetyJourney />);
    const safe = screen.getByRole('button', { name: 'Jo' });
    safe.focus();
    fireEvent.click(safe, { detail: 0 });
    expect(screen.getByRole('heading', { name: 'Si ndodhi lëndimi?' })).toHaveFocus();
  });
});
