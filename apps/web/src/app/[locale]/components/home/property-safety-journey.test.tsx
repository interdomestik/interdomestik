import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { propertyJourneyTestMessages } from './property-journey-test-messages';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => propertyJourneyTestMessages),
}));

import { PropertySafetyJourney } from './property-safety-journey';

function reachResult(propertyCountry = 'IT', residenceCountry = 'DE') {
  fireEvent.click(screen.getByRole('button', { name: 'Jo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ujë, rrjedhje ose përmbytje' }));
  fireEvent.click(screen.getByRole('button', { name: 'Po' }));
  fireEvent.click(screen.getByRole('button', { name: 'Qiramarrës' }));
  fireEvent.change(screen.getByLabelText('Shteti ku ndodhet prona'), {
    target: { value: propertyCountry },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Vazhdo' }));
  fireEvent.change(screen.getByLabelText('Shteti i vendbanimit të zakonshëm'), {
    target: { value: residenceCountry },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Vazhdo' }));
}

describe('PropertySafetyJourney', () => {
  it.each(['Po', 'Nuk jam i sigurt'])('fails %s closed before every sales action', answer => {
    render(<PropertySafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: answer }));

    expect(
      screen.getByRole('heading', { name: 'Largohuni nga rreziku para se të vazhdoni.' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Nëse ndodheni në BE.*112/i)).toBeInTheDocument();
    expect(screen.queryByText(/Organizo të dhënat/i)).not.toBeInTheDocument();
  });

  it('keeps damage, third-party, role, and both countries as distinct questions', () => {
    render(<PropertySafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Jo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zjarr ose tym' }));
    expect(screen.getByRole('heading', { name: /A përfshihet një fqinj/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jo' }));
    expect(screen.getByRole('heading', { name: /Cili është roli juaj/i })).toBeInTheDocument();
  });

  it('gives the useful free result before a fresh explicit property handoff', () => {
    const onContinue = vi.fn();
    render(<PropertySafetyJourney onContinue={onContinue} />);
    reachResult();

    expect(
      screen.getByRole('heading', { name: 'Mbroni njerëzit dhe ruani faktet e dëmit.' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Rregullat e vendit, policës dhe kontratës/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Organizo të dhënat e dëmit tim' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('omits the cross-border note when both countries are the same', () => {
    render(<PropertySafetyJourney />);
    reachResult('IT', 'IT');
    expect(
      screen.queryByText(/Rregullat e vendit, policës dhe kontratës/i)
    ).not.toBeInTheDocument();
  });
});
