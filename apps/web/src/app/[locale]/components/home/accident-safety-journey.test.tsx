import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const messages: Record<string, string> = {
  eyebrow: 'NDIHMË TANI',
  intro: 'Së pari sigurohemi që të gjithë janë të sigurt.',
  privacy: 'Përgjigjet qëndrojnë vetëm në këtë faqe dhe nuk dërgohen.',
  title: 'A është dikush i lënduar?',
  'injury.yes': 'Po, dikush është lënduar',
  'injury.materialOnly': 'Jo, vetëm dëm material',
  'injury.unsure': 'Nuk jam i sigurt',
  'injured.title': 'Siguria vjen e para.',
  'injured.body': 'Largohuni nga rreziku vetëm kur është e sigurt.',
  'injured.emergency': 'Kontaktoni shërbimet lokale të emergjencës.',
  'unsure.title': 'Trajtojeni si lëndim të mundshëm.',
  'unsure.body': 'Mos vazhdoni në rrugën e dëmit material derisa situata të jetë e qartë.',
  'unsure.emergency': 'Kërkoni menjëherë vlerësim profesional ose emergjent.',
  'vehicleSafety.title': 'A mund të lëvizet vetura pa rrezik?',
  'vehicleSafety.hint': 'Nëse dyshoni për rrotat, timonin ose frenat, mos e lëvizni.',
  'vehicleSafety.yes': 'Po, mund të lëvizet në mënyrë të sigurt',
  'vehicleSafety.no': 'Jo, nuk mund të lëvizet',
  'vehicleSafety.unsure': 'Nuk jam i sigurt për veturën',
  'unsafeVehicle.title': 'Mos e lëvizni veturën.',
  'unsafeVehicle.body': 'Qëndroni larg trafikut dhe ndizni sinjalizimin kur është e sigurt.',
  'unsafeVehicle.emergency': 'Kërkoni ndihmë lokale në rrugë ose shërbimet e emergjencës.',
  'countries.incidentTitle': 'Në cilin shtet ndodhi aksidenti?',
  'countries.incidentHint': 'Zgjidheni vetë; nuk e përcaktojmë nga gjuha ose vendndodhja.',
  'countries.incidentLabel': 'Shteti ku ndodhi aksidenti',
  'countries.placeholder': 'Zgjidhni shtetin',
  'countries.continue': 'Vazhdo',
  'countries.options.XK': 'Kosovë',
  'countries.options.DE': 'Gjermani',
  'countries.options.IT': 'Itali',
  'countries.registrationTitle': 'Ku është e regjistruar vetura juaj?',
  'countries.registrationHint': 'Kjo mund të ndryshojë dokumentet që ju duhen.',
  'countries.registrationLabel': 'Shteti i regjistrimit të veturës',
  'countries.counterpartyTitle': 'Nga cili shtet është siguruesi ose vetura tjetër?',
  'countries.counterpartyHint': 'Nëse nuk e dini, zgjidhni “Nuk jam i sigurt”.',
  'countries.counterpartyLabel': 'Shteti i siguruesit ose palës tjetër',
  'evidence.title': 'Ruani faktet e rëndësishme.',
  'evidence.body': 'Kur vendi është i sigurt, mblidhni provat pa u vënë në rrezik.',
  'evidence.items.scene': 'Fotografi të vendit, veturave dhe targave.',
  'evidence.items.insurance': 'Të dhënat e sigurimit ose Green Card.',
  'evidence.items.context': 'Datën, orën, vendin dhe dëshmitarët.',
  'evidence.items.reference': 'Referencën e policisë ose EAS vetëm kur zbatohet.',
  'evidence.diasporaTitle': 'Jashtë vendit? Jemi me ju.',
  'evidence.diasporaBody': 'Këto vende mbeten të ndara që rruga juaj të jetë e qartë.',
  'evidence.continue': 'Organizo të dhënat e rastit',
  changeAnswer: 'Ndrysho përgjigjen',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => messages[key] ?? key,
}));

import { AccidentSafetyJourney } from './accident-safety-journey';

describe('AccidentSafetyJourney', () => {
  it('stops ordinary preparation when someone is injured', () => {
    render(<AccidentSafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Po, dikush është lënduar' }));

    expect(screen.getByRole('heading', { name: 'Siguria vjen e para.' })).toBeInTheDocument();
    expect(screen.getByText(/shërbimet lokale të emergjencës/i)).toBeInTheDocument();
    expect(screen.queryByText(/Organizo të dhënat e rastit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ruaje dhe vazhdo më vonë/i)).not.toBeInTheDocument();
  });

  it('routes uncertainty to the precautionary outcome', () => {
    render(<AccidentSafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuk jam i sigurt' }));

    expect(
      screen.getByRole('heading', { name: 'Trajtojeni si lëndim të mundshëm.' })
    ).toBeInTheDocument();
    expect(screen.getByText(/vlerësim profesional ose emergjent/i)).toBeInTheDocument();
    expect(screen.queryByText(/A mund të lëvizet vetura/i)).not.toBeInTheDocument();
  });

  it('asks about vehicle safety only after material-damage confirmation', () => {
    render(<AccidentSafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Jo, vetëm dëm material' }));

    expect(
      screen.getByRole('heading', { name: 'A mund të lëvizet vetura pa rrezik?' })
    ).toBeInTheDocument();
    expect(screen.getByText(/rrotat, timonin ose frenat/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuk mund të lëvizet/i })).toBeInTheDocument();
  });

  it.each(['Jo, nuk mund të lëvizet', 'Nuk jam i sigurt për veturën'])(
    'keeps %s out of ordinary evidence guidance',
    answer => {
      render(<AccidentSafetyJourney />);
      fireEvent.click(screen.getByRole('button', { name: 'Jo, vetëm dëm material' }));
      fireEvent.click(screen.getByRole('button', { name: answer }));

      expect(screen.getByRole('heading', { name: 'Mos e lëvizni veturën.' })).toBeInTheDocument();
      expect(screen.getByText(/ndihmë lokale në rrugë/i)).toBeInTheDocument();
      expect(screen.queryByText(/Në cilin shtet ndodhi/i)).not.toBeInTheDocument();
    }
  );

  it('asks the visitor to confirm the incident country after a safe vehicle answer', () => {
    render(<AccidentSafetyJourney />);
    fireEvent.click(screen.getByRole('button', { name: 'Jo, vetëm dëm material' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Po, mund të lëvizet në mënyrë të sigurt' })
    );

    expect(
      screen.getByRole('heading', { name: 'Në cilin shtet ndodhi aksidenti?' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Shteti ku ndodhi aksidenti')).toHaveValue('');
  });

  it('keeps all country roles distinct and ends with universal evidence guidance', () => {
    render(<AccidentSafetyJourney />);
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

    expect(
      screen.getByRole('heading', { name: 'Ruani faktet e rëndësishme.' })
    ).toBeInTheDocument();
    expect(screen.getByText('Jashtë vendit? Jemi me ju.')).toBeInTheDocument();
    expect(screen.getByText(/Green Card/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organizo të dhënat e rastit' })).toBeInTheDocument();
  });

  it('moves focus once after keyboard activation', () => {
    render(<AccidentSafetyJourney />);
    const answer = screen.getByRole('button', { name: 'Jo, vetëm dëm material' });
    answer.focus();

    fireEvent.click(answer, { detail: 0 });

    expect(
      screen.getByRole('heading', { name: 'A mund të lëvizet vetura pa rrezik?' })
    ).toHaveFocus();
  });
});
