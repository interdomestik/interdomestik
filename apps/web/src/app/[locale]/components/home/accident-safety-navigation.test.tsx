import sqMessages from '@/messages/sq/accidentJourney.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => sqMessages),
}));

import { AccidentSafetyJourney } from './accident-safety-journey';

function reachEvidence() {
  fireEvent.click(screen.getByRole('button', { name: 'Jo, vetëm dëm material' }));
  fireEvent.click(screen.getByRole('button', { name: /Po, mund të lëvizet/i }));
  fireEvent.change(screen.getByLabelText('Shteti ku ndodhi aksidenti'), {
    target: { value: 'IT' },
  });
  fireEvent.change(screen.getByLabelText('Shteti i regjistrimit të veturës'), {
    target: { value: 'DE' },
  });
  fireEvent.change(screen.getByLabelText('Shteti i siguruesit ose palës tjetër'), {
    target: { value: 'XK' },
  });
}

describe('AccidentSafetyJourney navigation', () => {
  it('lets the visitor revise the material-damage answer', () => {
    render(<AccidentSafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Jo, vetëm dëm material' }));

    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho përgjigjen' }));

    expect(screen.getByRole('heading', { name: 'A është dikush i lënduar?' })).toBeInTheDocument();
  });

  it('continues with a preserved country without forcing a changed answer', () => {
    render(<AccidentSafetyJourney />);
    reachEvidence();
    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho përgjigjen' }));

    expect(screen.getByLabelText('Shteti i siguruesit ose palës tjetër')).toHaveValue('XK');
    fireEvent.click(screen.getByRole('button', { name: 'Vazhdo' }));

    expect(
      screen.getByRole('heading', { name: 'Ruani faktet e rëndësishme.' })
    ).toBeInTheDocument();
  });

  it('uses one announcement route for pointer and keyboard transitions', () => {
    render(<AccidentSafetyJourney />);
    const journeyContent = screen
      .getByRole('heading', { name: 'A është dikush i lënduar?' })
      .closest('[aria-live]');
    expect(journeyContent).toHaveAttribute('aria-live', 'polite');
    expect(journeyContent).toHaveAttribute('aria-labelledby', 'accident-journey-heading');

    fireEvent.click(screen.getByRole('button', { name: 'Jo, vetëm dëm material' }), { detail: 0 });
    expect(journeyContent).toHaveAttribute('aria-live', 'off');
    expect(screen.getByRole('heading', { name: /A mund të lëvizet vetura/i })).toHaveFocus();
  });

  it('announces urgent pointer outcomes assertively without an alert role', () => {
    render(<AccidentSafetyJourney />);
    const journeyContent = screen
      .getByRole('heading', { name: 'A është dikush i lënduar?' })
      .closest('[aria-live]');

    fireEvent.click(screen.getByRole('button', { name: 'Po, dikush është lënduar' }), {
      detail: 1,
    });

    expect(journeyContent).toHaveAttribute('aria-live', 'assertive');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
