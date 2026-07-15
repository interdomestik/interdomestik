import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { propertyJourneyTestMessages } from './property-journey-test-messages';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => propertyJourneyTestMessages),
}));

import { PropertySafetyJourney } from './property-safety-journey';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function reachCountries() {
  fireEvent.click(screen.getByRole('button', { name: 'Jo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Produkt, pajisje ose instalim' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nuk jam i sigurt' }));
  fireEvent.click(screen.getByRole('button', { name: 'Po veproj për dikë tjetër me autorizim' }));
}

describe('PropertySafetyJourney boundaries', () => {
  it('never asks for identity, address, policy, value, narrative, or upload', () => {
    render(<PropertySafetyJourney />);
    expect(
      screen.queryByLabelText(/emër|adres|polic|vlerë|përshkruani|ngarko|dokument/i)
    ).not.toBeInTheDocument();
  });

  it('keeps every answer out of storage, history, URL, and network', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const pushSpy = vi.spyOn(history, 'pushState');
    const replaceSpy = vi.spyOn(history, 'replaceState');
    const initialHref = window.location.href;
    const initialState = history.state;

    render(<PropertySafetyJourney />);
    reachCountries();
    fireEvent.change(screen.getByLabelText('Shteti ku ndodhet prona'), {
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
    expect(screen.getByText(/kjo faqe nuk provon autorizimin/i)).toBeInTheDocument();
  });

  it('moves focus after keyboard activation', () => {
    render(<PropertySafetyJourney />);
    const safe = screen.getByRole('button', { name: 'Jo' });
    safe.focus();
    fireEvent.click(safe, { detail: 0 });
    expect(screen.getByRole('heading', { name: 'Çfarë lloj dëmi ka ndodhur?' })).toHaveFocus();
  });
});
