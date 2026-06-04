import type { ClaimStartHandoffContext } from './types';

export type ClaimIncidentCountry = {
  incidentCountryCode: string | null;
  incidentJurisdiction: string | null;
};

export type ClaimIncidentCountryInput = {
  incidentCountryCode?: string | null;
  incidentJurisdiction?: string | null;
};

const ISO_3166_ALPHA2 = /^[A-Z]{2}$/u;
const COUNTRY_JURISDICTION = /^country:[A-Z]{2}$/u;

function normalizeCountryCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || !ISO_3166_ALPHA2.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeCountryJurisdiction(
  value: string | null | undefined,
  countryCode: string
): string {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/^country:/u, '')
    .toUpperCase();
  if (normalized && normalized === countryCode) {
    return `country:${countryCode}`;
  }

  const explicit = value?.trim();
  if (explicit && COUNTRY_JURISDICTION.test(explicit) && explicit.endsWith(countryCode)) {
    return explicit;
  }

  return `country:${countryCode}`;
}

export function resolveClaimIncidentCountry(
  input: ClaimIncidentCountryInput
): ClaimIncidentCountry {
  const incidentCountryCode = normalizeCountryCode(input.incidentCountryCode);
  if (!incidentCountryCode) {
    return { incidentCountryCode: null, incidentJurisdiction: null };
  }

  return {
    incidentCountryCode,
    incidentJurisdiction: normalizeCountryJurisdiction(
      input.incidentJurisdiction,
      incidentCountryCode
    ),
  };
}

export function resolveClaimIncidentCountryUpdate(
  input: ClaimIncidentCountryInput
): Partial<ClaimIncidentCountry> {
  if (input.incidentCountryCode === undefined && input.incidentJurisdiction === undefined) {
    return {};
  }

  if (input.incidentCountryCode === undefined) {
    return {};
  }

  return resolveClaimIncidentCountry(input);
}

export function resolveHandoffIncidentCountry(
  handoffContext: ClaimStartHandoffContext | null | undefined
): ClaimIncidentCountry {
  if (handoffContext?.source !== 'diaspora-green-card') {
    return { incidentCountryCode: null, incidentJurisdiction: null };
  }

  return resolveClaimIncidentCountry({ incidentCountryCode: handoffContext.country });
}

export function resolveSubmittedClaimIncidentCountry(args: {
  data: ClaimIncidentCountryInput;
  handoffContext: ClaimStartHandoffContext | null | undefined;
}): ClaimIncidentCountry {
  const handoffCountry = resolveHandoffIncidentCountry(args.handoffContext);
  if (handoffCountry.incidentCountryCode) {
    return handoffCountry;
  }

  return resolveClaimIncidentCountry(args.data);
}

export function buildClaimStartPublicNote(
  handoffContext: ClaimStartHandoffContext | null | undefined
): string | null {
  const incidentCountry = resolveHandoffIncidentCountry(handoffContext);
  if (!incidentCountry.incidentCountryCode || handoffContext?.incidentLocation !== 'abroad') {
    return null;
  }

  return `Started from Diaspora / Green Card quickstart. Country: ${incidentCountry.incidentCountryCode}. Incident location: ${handoffContext.incidentLocation}.`;
}
