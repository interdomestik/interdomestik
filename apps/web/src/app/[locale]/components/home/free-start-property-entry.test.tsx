import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
      />
    );
  },
}));

vi.mock('./injury-safety-journey', () => ({ InjurySafetyJourney: () => null }));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { dispatchPublicEntryIntent } from './public-entry-intent';

describe('Free Start property entry', () => {
  it('hands off a fresh property situation without a continuation step', () => {
    render(<FreeStartIntakeShell continueHref="/pricing" locale="sq" />);

    act(() => dispatchPublicEntryIntent('property'));

    const intake = screen.getByTestId('legacy-free-start');
    expect(intake).toHaveAttribute('data-intent-category', 'property');
    expect(intake).toHaveAttribute('data-intent-sequence', '1');
    // The situation arrives as a bounded intent, so no remount discards entered facts.
    expect(intake).not.toHaveAttribute('data-initial-category');
    expect(screen.queryByTestId('property-safety-journey')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Organizo të dhënat e dëmit tim' })
    ).not.toBeInTheDocument();
  });
});
