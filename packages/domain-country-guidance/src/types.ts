import { z } from 'zod';

export const SupportedLanguages = ['en', 'sq', 'mk', 'de', 'hr'] as const;
export type SupportedLanguage = (typeof SupportedLanguages)[number];

export const CountryCodeSchema = z.enum([
  'AT',
  'DE',
  'CH',
  'IT',
  'MK',
  'AL',
  'XK',
  'FR',
  'BE',
  'NL',
  'ES',
  'PT',
  'HU',
  'PL',
  'CZ',
  'RO',
  'SE',
  'NO',
  'DK',
  'IE',
]);
export type CountryCode = z.infer<typeof CountryCodeSchema>;

export interface CountryGuidanceRule {
  step: number;
  description: string;
}

export interface CountryGuidance {
  countryCode: CountryCode;
  emergencyNumbers: {
    police: string;
    ambulance: string;
    fire: string;
    general?: string;
  };
  rules: {
    firstSteps: CountryGuidanceRule[];
    policeRequired: boolean;
    europeanAccidentStatementAllowed: boolean;
    additionalNotes?: string;
  };
}
