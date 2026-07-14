import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./free-start-intake-shell/index', () => ({
  FreeStartIntakeShell: ({ initialCategory }: { initialCategory?: string }) => {
    const [mountedCategory] = useState(initialCategory);
    return <section data-initial-category={mountedCategory} data-testid="legacy-free-start" />;
  },
}));

vi.mock('./accident-safety-journey', () => ({
  AccidentSafetyJourney: () => <section data-testid="accident-safety-journey" />,
}));

vi.mock('./injury-safety-journey', () => ({
  InjurySafetyJourney: ({ onContinue }: { onContinue?: () => void }) => {
    const [advanced, setAdvanced] = useState(false);
    return (
      <section data-testid="injury-safety-journey">
        {advanced ? <p>Rezultati i orientimit</p> : null}
        <button type="button" onClick={() => setAdvanced(true)}>
          Trego rezultatin
        </button>
        <button type="button" onClick={onContinue}>
          Organizo të dhënat e rastit tim
        </button>
      </section>
    );
  },
}));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { dispatchPublicEntryIntent } from './public-entry-intent';

describe('Free Start injury entry', () => {
  it('hands off only the confirmed injury category on a fresh explicit action', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    act(() => dispatchPublicEntryIntent('injury'));

    fireEvent.click(screen.getByRole('button', { name: 'Organizo të dhënat e rastit tim' }));

    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute(
      'data-initial-category',
      'injury'
    );
  });

  it('clears injury state when public entry is disabled', () => {
    const { rerender } = render(
      <FreeStartIntakeShell continueHref="/pricing" locale="sq" publicEntryEnabled />
    );
    act(() => dispatchPublicEntryIntent('injury'));
    expect(screen.getByTestId('injury-safety-journey')).toBeInTheDocument();

    rerender(
      <FreeStartIntakeShell continueHref="/member" locale="sq" publicEntryEnabled={false} />
    );
    expect(screen.getByTestId('legacy-free-start')).not.toHaveAttribute('data-initial-category');
  });

  it('starts fresh when the injury hero intent is selected again', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    act(() => dispatchPublicEntryIntent('injury'));
    fireEvent.click(screen.getByRole('button', { name: 'Trego rezultatin' }));
    expect(screen.getByText('Rezultati i orientimit')).toBeInTheDocument();

    act(() => dispatchPublicEntryIntent('injury'));

    expect(screen.queryByText('Rezultati i orientimit')).not.toBeInTheDocument();
  });
});
