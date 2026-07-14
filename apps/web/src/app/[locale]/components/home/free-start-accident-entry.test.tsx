import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
  FreeStartIntakeShell: ({ initialCategory }: { initialCategory?: string }) => {
    const [mountedCategory] = useState(initialCategory);
    return (
      <section data-initial-category={mountedCategory} data-testid="legacy-free-start">
        Fallback
      </section>
    );
  },
}));

vi.mock('./accident-safety-journey', () => ({
  AccidentSafetyJourney: ({ onContinue }: { onContinue?: () => void }) => (
    <section>
      <h2>A është dikush i lënduar?</h2>
      <button type="button" onClick={onContinue}>
        Organizo të dhënat e rastit
      </button>
    </section>
  ),
}));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { dispatchPublicEntryIntent, takePendingPublicEntryIntent } from './public-entry-intent';

describe('FreeStart accident entry', () => {
  it('consumes a vehicle intent dispatched before the intake listener mounts', () => {
    dispatchPublicEntryIntent('vehicle');

    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);

    expect(screen.getByRole('heading', { name: 'A është dikush i lënduar?' })).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-free-start')).not.toBeInTheDocument();
  });

  it('keeps direct entry on fallback and opens the safety question only for vehicle intent', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    expect(screen.getByTestId('legacy-free-start')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('interdomestik:public-intent', { detail: { intent: 'property' } })
      );
    });
    expect(screen.getByTestId('legacy-free-start')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('interdomestik:public-intent', { detail: { intent: 'vehicle' } })
      );
    });

    expect(screen.getByRole('heading', { name: 'A është dikush i lënduar?' })).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-free-start')).not.toBeInTheDocument();
  });

  it('continues into vehicle details without asking for the category again', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent('interdomestik:public-intent', { detail: { intent: 'vehicle' } })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Organizo të dhënat e rastit' }));

    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute(
      'data-initial-category',
      'vehicle'
    );
  });

  it('clears the transient public journey when the page settles as authenticated', () => {
    const { rerender } = render(
      <FreeStartIntakeShell continueHref="/pricing" locale="sq" publicEntryEnabled />
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent('interdomestik:public-intent', { detail: { intent: 'vehicle' } })
      );
    });
    expect(screen.getByRole('heading', { name: 'A është dikush i lënduar?' })).toBeInTheDocument();

    rerender(
      <FreeStartIntakeShell continueHref="/member" locale="sq" publicEntryEnabled={false} />
    );

    expect(screen.getByTestId('legacy-free-start')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'A është dikush i lënduar?' })
    ).not.toBeInTheDocument();
  });

  it('remounts the legacy intake without vehicle state after authentication settles', () => {
    const { rerender } = render(
      <FreeStartIntakeShell continueHref="/pricing" locale="sq" publicEntryEnabled />
    );
    act(() => dispatchPublicEntryIntent('vehicle'));
    fireEvent.click(screen.getByRole('button', { name: 'Organizo të dhënat e rastit' }));
    expect(screen.getByTestId('legacy-free-start')).toHaveAttribute(
      'data-initial-category',
      'vehicle'
    );

    rerender(
      <FreeStartIntakeShell continueHref="/member" locale="sq" publicEntryEnabled={false} />
    );

    expect(screen.getByTestId('legacy-free-start')).not.toHaveAttribute('data-initial-category');
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
