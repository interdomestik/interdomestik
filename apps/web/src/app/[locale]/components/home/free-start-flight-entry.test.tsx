import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./free-start-intake-shell/index', () => ({
  FreeStartIntakeShell: () => <section data-testid="legacy-free-start" />,
}));
vi.mock('./accident-safety-journey', () => ({ AccidentSafetyJourney: () => null }));
vi.mock('./injury-safety-journey', () => ({ InjurySafetyJourney: () => null }));
vi.mock('./property-safety-journey', () => ({ PropertySafetyJourney: () => null }));
vi.mock('./flight-disruption-journey', () => ({
  FlightDisruptionJourney: () => <section data-testid="flight-disruption-journey" />,
}));
vi.mock('./flight-no-script-guidance', () => ({
  FlightNoScriptGuidance: () => <section id="flight-guidance">Static flight help</section>,
}));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { dispatchPublicEntryIntent } from './public-entry-intent';

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
});

describe('Free Start flight entry', () => {
  it('opens orientation without mounting a flight intake category', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    act(() => dispatchPublicEntryIntent('flight'));
    expect(screen.getByTestId('flight-disruption-journey')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-free-start')).not.toBeInTheDocument();
  });

  it('restores the flight orientation from its public fragment URL', () => {
    window.history.replaceState(null, '', '#flight-guidance');
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    expect(screen.getByTestId('flight-disruption-journey')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-free-start')).not.toBeInTheDocument();
  });
});
