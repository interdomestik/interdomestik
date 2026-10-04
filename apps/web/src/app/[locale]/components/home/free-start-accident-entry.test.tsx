import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      eyebrow: 'NDIHMË TANI',
      title: 'A është dikush i lënduar?',
      intro: 'Së pari sigurohemi që të gjithë janë të sigurt.',
      'injury.yes': 'Po, dikush është lënduar',
      'injury.materialOnly': 'Jo, vetëm dëm material',
      'injury.unsure': 'Nuk jam i sigurt',
      back: 'Kthehu',
    })[key] ?? key,
}));

vi.mock('./free-start-intake-shell/index', () => ({
  FreeStartIntakeShell: ({
    categoryIntent,
    initialCategory,
  }: {
    categoryIntent?: { category: string; sequence: number } | null;
    initialCategory?: string;
  }) => {
    const [mountedCategory] = useState(initialCategory);
    return (
      <section
        data-initial-category={mountedCategory}
        data-intent-category={categoryIntent?.category}
        data-intent-sequence={categoryIntent?.sequence}
        data-testid="legacy-free-start"
      >
        Fallback
      </section>
    );
  },
}));

vi.mock('./injury-safety-journey', () => ({
  InjurySafetyJourney: ({ onContinue }: { onContinue?: () => void }) => (
    <section data-testid="injury-safety-journey">
      <h2>Lëndim personal</h2>
      <button type="button" onClick={onContinue}>
        Organizo të dhënat e rastit
      </button>
    </section>
  ),
}));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { dispatchPublicEntryIntent, takePendingPublicEntryIntent } from './public-entry-intent';

function dispatchIntent(intent: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent('interdomestik:public-intent', { detail: { intent } }));
  });
}

describe('FreeStart public entry routing', () => {
  beforeEach(() => takePendingPublicEntryIntent());

  it('opens the facts for a vehicle intent dispatched before the listener mounts', () => {
    dispatchPublicEntryIntent('vehicle');

    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);

    const intake = screen.getByTestId('legacy-free-start');
    expect(intake).toHaveAttribute('data-intent-category', 'vehicle');
    expect(intake).toHaveAttribute('data-intent-sequence', '1');
    expect(screen.queryByTestId('injury-safety-journey')).not.toBeInTheDocument();
  });

  it('sends supported situations straight to the facts and keeps unsupported guidance', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    const intake = screen.getByTestId('legacy-free-start');
    expect(intake).not.toHaveAttribute('data-intent-category');

    dispatchIntent('property');
    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute(
      'data-intent-category',
      'property'
    );
    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute('data-intent-sequence', '1');

    dispatchIntent('vehicle');
    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute(
      'data-intent-category',
      'vehicle'
    );
    // A second deliberate activation is a new sequence, never a remount of the editor.
    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute('data-intent-sequence', '2');

    dispatchIntent('injury');
    expect(screen.getByTestId('injury-safety-journey')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-free-start')).not.toBeInTheDocument();
  });

  it('continues into injury details without asking for the category again', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    dispatchIntent('injury');

    fireEvent.click(screen.getByRole('button', { name: 'Organizo të dhënat e rastit' }));

    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute(
      'data-initial-category',
      'injury'
    );
  });

  it('clears the transient public journey when the page settles as authenticated', () => {
    const { rerender } = render(
      <FreeStartIntakeShell continueHref="/pricing" locale="sq" publicEntryEnabled />
    );
    dispatchIntent('injury');
    expect(screen.getByTestId('injury-safety-journey')).toBeInTheDocument();

    rerender(
      <FreeStartIntakeShell continueHref="/member" locale="sq" publicEntryEnabled={false} />
    );

    expect(screen.getByTestId('legacy-free-start')).toBeInTheDocument();
    expect(screen.queryByTestId('injury-safety-journey')).not.toBeInTheDocument();
  });

  it('remounts the legacy intake without public entry state after authentication settles', () => {
    const { rerender } = render(
      <FreeStartIntakeShell continueHref="/pricing" locale="sq" publicEntryEnabled />
    );
    act(() => dispatchPublicEntryIntent('vehicle'));
    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute(
      'data-intent-category',
      'vehicle'
    );

    rerender(
      <FreeStartIntakeShell continueHref="/member" locale="sq" publicEntryEnabled={false} />
    );

    expect(screen.getByTestId('legacy-free-start')).not.toHaveAttribute('data-initial-category');
    expect(screen.getByTestId('legacy-free-start')).not.toHaveAttribute('data-intent-category');
  });

  it('ignores intent dispatch outside a browser context', () => {
    const browserWindow = window;
    let thrown: unknown;
    vi.stubGlobal('window', undefined);
    try {
      dispatchPublicEntryIntent('vehicle');
    } catch (error) {
      thrown = error;
    } finally {
      vi.stubGlobal('window', browserWindow);
      takePendingPublicEntryIntent();
      vi.unstubAllGlobals();
    }

    expect(thrown).toBeUndefined();
  });
});
