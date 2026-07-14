export const INJURY_COUNTRY_CODES = [
  'XK',
  'AL',
  'MK',
  'DE',
  'IT',
  'AT',
  'CH',
  'RS',
  'ME',
  'HR',
  'SI',
  'OTHER',
  'UNKNOWN',
] as const;

export const INJURY_URGENCY_ANSWERS = ['yes', 'no', 'unsure'] as const;
export const INJURY_SOURCES = [
  'traffic',
  'workplace',
  'fall',
  'product',
  'treatment',
  'assault',
  'unsure',
] as const;

export type InjuryStage =
  | 'urgency'
  | 'urgent'
  | 'source'
  | 'treatmentReferral'
  | 'assaultReferral'
  | 'unsureReferral'
  | 'incidentCountry'
  | 'residenceCountry'
  | 'evidence';

export function getInjuryJourneyOptions(t: (key: string) => string) {
  return {
    countryOptions: INJURY_COUNTRY_CODES.map(code => ({
      code,
      label: t(`countries.options.${code}`),
    })),
    sourceOptions: INJURY_SOURCES.map(source => ({
      id: source,
      label: t(`source.${source}`),
    })),
    urgencyOptions: INJURY_URGENCY_ANSWERS.map(answer => ({
      id: answer,
      label: t(`urgency.${answer}`),
    })),
  };
}
