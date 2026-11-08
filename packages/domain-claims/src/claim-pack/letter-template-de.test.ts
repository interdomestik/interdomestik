import { describe, expect, it } from 'vitest';
import { generateLetter } from './letter-template';
import type { ClaimPackType, IntakeAnswers } from './types';

const ENGLISH_MARKERS = ['Dear Sir or Madam', 'Yours sincerely', 'Amount claimed', 'Subject:'];

describe('German claim-pack letters', () => {
  it.each([
    [
      'vehicle',
      { incidentDate: '2026-04-01', description: 'Auffahrunfall', estimatedAmount: 250000 },
      'Betreff: Antrag auf Ersatz des Fahrzeugschadens',
      'bei dem mein Fahrzeug beschädigt wurde',
    ],
    [
      'property',
      { incidentDate: '2026-03-15', description: 'Wasserschaden', estimatedAmount: 99000 },
      'Betreff: Antrag auf Ersatz eines Sachschadens',
      'Schaden an meinem Eigentum',
    ],
    [
      'injury',
      { incidentDate: '2026-03-20', description: 'Sturz im Geschäft', estimatedAmount: 150050 },
      'Betreff: Antrag auf Entschädigung für einen Personenschaden',
      'infolge Ihrer Fahrlässigkeit',
    ],
  ] as const)('writes the %s letter in German', (claimType, answers, subject, opening) => {
    const result = generateLetter(claimType as ClaimPackType, answers as IntakeAnswers, 'de');

    expect(result.locale).toBe('de');
    expect(result.body).toContain(subject);
    expect(result.body).toContain(opening);
    expect(result.body).toContain(`Datum: ${answers.incidentDate}`);
    expect(result.body).toContain(answers.description);
    expect(result.body).toContain(
      `Geforderter Betrag: ${(answers.estimatedAmount / 100).toFixed(2)} EUR`
    );
    expect(result.body).toContain('Sehr geehrte Damen und Herren,');
    expect(result.body).toContain('15 Arbeitstagen');
    expect(result.body).toMatch(/Mit freundlichen Grüßen\n\[YOUR_FULL_NAME\]$/u);
    for (const marker of ENGLISH_MARKERS) expect(result.body).not.toContain(marker);
  });

  it.each([
    ['vehicle', 'Beschreibung des Vorfalls: der unten beschriebene Vorfall'],
    ['property', 'Beschreibung des Schadens: der unten beschriebene Schaden'],
    ['injury', 'Beschreibung des Vorfalls: die unten beschriebene Verletzung'],
  ] as const)('keeps German fallbacks and placeholders for an empty %s intake', (type, line) => {
    const result = generateLetter(type, { incidentDate: '', description: '' }, 'de');

    expect(result.body).toContain(line);
    expect(result.body).toContain('Datum: [DATE]');
    expect(result.placeholders).toEqual([
      '[YOUR_FULL_NAME]',
      '[YOUR_ADDRESS]',
      '[RECIPIENT_NAME]',
      '[RECIPIENT_ADDRESS]',
      '[DATE]',
      '[REFERENCE_NUMBER]',
      '[CLAIMED_AMOUNT]',
    ]);
  });
});
