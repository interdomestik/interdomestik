export const PROPERTY_COUNTRY_CODES = [
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

export const PROPERTY_SAFETY_ANSWERS = ['yes', 'no', 'unsure'] as const;
export const PROPERTY_DAMAGE_TYPES = [
  'water',
  'fire',
  'storm',
  'theft',
  'product',
  'other',
  'unsure',
] as const;
export const PROPERTY_THIRD_PARTY_ANSWERS = ['yes', 'no', 'unsure'] as const;
export const PROPERTY_ROLES = ['owner', 'tenant', 'business', 'acting', 'unsure'] as const;

export type PropertyDamageType = (typeof PROPERTY_DAMAGE_TYPES)[number];
export type PropertyThirdParty = (typeof PROPERTY_THIRD_PARTY_ANSWERS)[number];
export type PropertyRole = (typeof PROPERTY_ROLES)[number];
export type PropertyStage =
  | 'safety'
  | 'danger'
  | 'damage'
  | 'thirdParty'
  | 'role'
  | 'propertyCountry'
  | 'residenceCountry'
  | 'evidence';

export function getPropertyGuidanceKeys(
  damageType: PropertyDamageType,
  thirdParty: PropertyThirdParty,
  role: PropertyRole
): string[] {
  const keys = [`type.${damageType}`, `role.${role}`];
  if (thirdParty !== 'no') keys.push('thirdParty');
  return keys;
}

export function getPropertyJourneyOptions(t: (key: string) => string) {
  return {
    countryOptions: PROPERTY_COUNTRY_CODES.map(code => ({
      code,
      label: t(`countries.options.${code}`),
    })),
    damageOptions: PROPERTY_DAMAGE_TYPES.map(id => ({ id, label: t(`damage.${id}`) })),
    roleOptions: PROPERTY_ROLES.map(id => ({ id, label: t(`role.${id}`) })),
    safetyOptions: PROPERTY_SAFETY_ANSWERS.map(id => ({ id, label: t(`safety.${id}`) })),
    thirdPartyOptions: PROPERTY_THIRD_PARTY_ANSWERS.map(id => ({
      id,
      label: t(`thirdParty.${id}`),
    })),
  };
}
