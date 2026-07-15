import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./free-start-intake-shell/index', () => ({
  FreeStartIntakeShell: ({ initialCategory }: { initialCategory?: string }) => {
    const [mountedCategory] = useState(initialCategory);
    return <section data-initial-category={mountedCategory} data-testid="legacy-free-start" />;
  },
}));

vi.mock('./accident-safety-journey', () => ({ AccidentSafetyJourney: () => null }));
vi.mock('./injury-safety-journey', () => ({ InjurySafetyJourney: () => null }));
vi.mock('./property-safety-journey', () => ({
  PropertySafetyJourney: ({ onContinue }: { onContinue?: () => void }) => (
    <section data-testid="property-safety-journey">
      <button type="button" onClick={onContinue}>
        Organizo të dhënat e dëmit tim
      </button>
    </section>
  ),
}));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { dispatchPublicEntryIntent } from './public-entry-intent';

describe('Free Start property entry', () => {
  it('hands off only a fresh property category on explicit continuation', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    act(() => dispatchPublicEntryIntent('property'));
    expect(screen.getByTestId('property-safety-journey')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Organizo të dhënat e dëmit tim' }));
    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute(
      'data-initial-category',
      'property'
    );
  });
});
