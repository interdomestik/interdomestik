import sqMessages from '@/messages/sq/accidentJourney.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => sqMessages),
}));

import { AccidentSafetyJourney } from './accident-safety-journey';

function reachCountryQuestions() {
  fireEvent.click(screen.getByRole('button', { name: 'Jo, vetëm dëm material' }));
  fireEvent.click(screen.getByRole('button', { name: /Po, mund të lëvizet/i }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AccidentSafetyJourney boundaries', () => {
  it('does not move pointer focus to the next heading', () => {
    render(<AccidentSafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Jo, vetëm dëm material' }), {
      detail: 1,
    });

    expect(screen.getByRole('heading', { name: /A mund të lëvizet vetura/i })).not.toHaveFocus();
  });

  it('clears downstream countries when an upstream country changes', () => {
    render(<AccidentSafetyJourney />);
    reachCountryQuestions();
    fireEvent.change(screen.getByLabelText('Shteti ku ndodhi aksidenti'), {
      target: { value: 'IT' },
    });
    fireEvent.change(screen.getByLabelText('Shteti i regjistrimit të veturës'), {
      target: { value: 'DE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho përgjigjen' }));
    expect(screen.getByLabelText('Shteti i regjistrimit të veturës')).toHaveValue('DE');
    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho përgjigjen' }));
    fireEvent.change(screen.getByLabelText('Shteti ku ndodhi aksidenti'), {
      target: { value: 'DE' },
    });

    expect(screen.getByLabelText('Shteti i regjistrimit të veturës')).toHaveValue('');
  });

  it('keeps all answers out of storage, history, URL, and network', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const pushSpy = vi.spyOn(history, 'pushState');
    const replaceSpy = vi.spyOn(history, 'replaceState');
    const initialHref = window.location.href;
    const initialState = history.state;

    render(<AccidentSafetyJourney />);
    reachCountryQuestions();
    fireEvent.change(screen.getByLabelText('Shteti ku ndodhi aksidenti'), {
      target: { value: 'IT' },
    });
    fireEvent.change(screen.getByLabelText('Shteti i regjistrimit të veturës'), {
      target: { value: 'DE' },
    });
    fireEvent.change(screen.getByLabelText('Shteti i siguruesit ose palës tjetër'), {
      target: { value: 'XK' },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialHref);
    expect(history.state).toBe(initialState);
  });

  it('allows the visitor to revise the last country from the evidence outcome', () => {
    render(<AccidentSafetyJourney />);
    reachCountryQuestions();
    fireEvent.change(screen.getByLabelText('Shteti ku ndodhi aksidenti'), {
      target: { value: 'IT' },
    });
    fireEvent.change(screen.getByLabelText('Shteti i regjistrimit të veturës'), {
      target: { value: 'DE' },
    });
    fireEvent.change(screen.getByLabelText('Shteti i siguruesit ose palës tjetër'), {
      target: { value: 'XK' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho përgjigjen' }));

    expect(screen.getByLabelText('Shteti i siguruesit ose palës tjetër')).toHaveValue('XK');
  });
});
