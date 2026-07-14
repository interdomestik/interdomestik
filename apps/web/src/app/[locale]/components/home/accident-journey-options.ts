export const ACCIDENT_COUNTRY_CODES = [
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

export const INJURY_ANSWERS = ['yes', 'materialOnly', 'unsure'] as const;

export type AccidentStage =
  | 'injury'
  | 'injured'
  | 'unsure'
  | 'vehicleSafety'
  | 'unsafeVehicle'
  | 'incidentCountry'
  | 'registrationCountry'
  | 'counterpartyCountry'
  | 'evidence';

export function getAccidentJourneyOptions(t: (key: string) => string) {
  return {
    countryOptions: ACCIDENT_COUNTRY_CODES.map(code => ({
      code,
      label: t(`countries.options.${code}`),
    })),
    injuryOptions: INJURY_ANSWERS.map(answer => ({
      id: answer,
      label: t(`injury.${answer}`),
    })),
    vehicleSafetyOptions: (['yes', 'no', 'unsure'] as const).map(answer => ({
      id: answer,
      label: t(`vehicleSafety.${answer}`),
    })),
  };
}
