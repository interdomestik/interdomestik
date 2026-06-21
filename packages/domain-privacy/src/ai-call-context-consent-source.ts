const GENERIC_TERMS_PRIVACY_SOURCES = new Set([
  'privacy',
  'privacy_policy',
  'privacy-policy',
  'terms',
  'terms_and_privacy',
  'terms-and-privacy',
  'terms_of_service',
  'terms-of-service',
]);

export function isGenericTermsPrivacyConsentSource(sourceSurface: string): boolean {
  return GENERIC_TERMS_PRIVACY_SOURCES.has(sourceSurface.trim().toLowerCase());
}
