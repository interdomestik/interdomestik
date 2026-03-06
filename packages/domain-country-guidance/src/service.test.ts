import { describe, expect, it } from 'vitest';

import { DATA } from './data';
import { CountryGuidanceService } from './service';

describe('CountryGuidanceService', () => {
  const service = new CountryGuidanceService();

  it('returns localized guidance for supported languages', () => {
    const guidance = service.getGuidance('mk', 'mk');

    expect(guidance.countryCode).toBe('MK');
    expect(guidance.rules.policeRequired).toBe(true);
    expect(guidance.rules.firstSteps[0]?.description).toContain('Обезбедете');
  });

  it('falls back to English when the requested language is unsupported', () => {
    const guidance = service.getGuidance('al', 'sr');

    expect(guidance.countryCode).toBe('AL');
    expect(guidance.rules.firstSteps[0]?.description).toBe(
      'Secure the accident scene and turn on hazard lights.'
    );
  });

  it('throws for unsupported country codes', () => {
    expect(() => service.getGuidance('rs', 'en')).toThrow('Country code RS not supported');
  });

  it('reports the supported country list from the data dictionary', () => {
    expect(service.getSupportedCountries()).toEqual(Object.keys(DATA));
  });
});
