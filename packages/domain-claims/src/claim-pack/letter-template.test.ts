import { describe, expect, it } from 'vitest';
import { generateLetter } from './letter-template';
import type { VehicleIntakeAnswers } from './types';

describe('generateLetter', () => {
  const baseAnswers: VehicleIntakeAnswers = {
    incidentDate: '2026-04-01',
    description: 'Rear-end collision at main intersection',
    estimatedAmount: 250000,
    currency: 'EUR',
  };

  describe('vehicle letters', () => {
    it('generates an English vehicle letter', () => {
      const result = generateLetter('vehicle', baseAnswers, 'en');
      expect(result.locale).toBe('en');
      expect(result.body).toContain('vehicle damage compensation');
      expect(result.body).toContain('2026-04-01');
      expect(result.body).toContain('Rear-end collision');
      expect(result.body).toContain('2500.00 EUR');
    });

    it('generates an Albanian vehicle letter', () => {
      const result = generateLetter('vehicle', baseAnswers, 'sq');
      expect(result.locale).toBe('sq');
      expect(result.body).toContain('automjetit');
      expect(result.body).toContain('2026-04-01');
    });

    it('generates Macedonian and Serbian vehicle letters', () => {
      expect(generateLetter('vehicle', baseAnswers, 'mk').body).toContain('возило');
      expect(generateLetter('vehicle', baseAnswers, 'sr').body).toContain('vozilu');
    });

    it('includes placeholder markers for missing info', () => {
      const result = generateLetter('vehicle', baseAnswers, 'en');
      expect(result.placeholders).toContain('[YOUR_FULL_NAME]');
      expect(result.placeholders).toContain('[YOUR_ADDRESS]');
      expect(result.placeholders).toContain('[RECIPIENT_NAME]');
    });

    it('includes amount placeholder when no amount provided', () => {
      const noAmount: VehicleIntakeAnswers = {
        incidentDate: '2026-04-01',
        description: 'Collision',
      };
      const result = generateLetter('vehicle', noAmount, 'en');
      expect(result.body).toContain('[CLAIMED_AMOUNT]');
      expect(result.placeholders).toContain('[CLAIMED_AMOUNT]');
    });
  });

  describe('property letters', () => {
    it('generates a property damage letter', () => {
      const result = generateLetter(
        'property',
        { incidentDate: '2026-03-15', description: 'Water damage from neighbor' },
        'en'
      );
      expect(result.body).toContain('property damage');
      expect(result.body).toContain('Water damage');
    });
  });

  describe('injury letters', () => {
    it('generates an injury claim letter', () => {
      const result = generateLetter(
        'injury',
        { incidentDate: '2026-03-20', description: 'Slip and fall at store' },
        'en'
      );
      expect(result.body).toContain('personal injury');
      expect(result.body).toContain('Slip and fall');
    });

    it('generates an Albanian injury letter', () => {
      const result = generateLetter(
        'injury',
        { incidentDate: '2026-03-20', description: 'Lëndim' },
        'sq'
      );
      expect(result.body).toContain('lëndimit personal');
    });
  });

  describe('default locale', () => {
    it('defaults to English when no locale specified', () => {
      const result = generateLetter('vehicle', baseAnswers);
      expect(result.locale).toBe('en');
      expect(result.body).toContain('Dear Sir or Madam');
    });
  });
});
