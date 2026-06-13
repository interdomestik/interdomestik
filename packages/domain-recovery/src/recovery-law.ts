import type { LawPack } from './law-pack-schema';

export const RECOVERY_LAW_FIELD = 'claims.recovery_law' as const;
export const RECOVERY_LEGAL_TENANT_FIELD = 'claims.recovery_legal_tenant_id' as const;

export const RECOVERY_UNSUPPORTED_REASON = 'no_network_or_unsupported_jurisdiction' as const;
export const RECOVERY_NO_NETWORK_DECLINE_REASON = 'no_network' as const;

export type RecoveryJurisdictionConfig = {
  incidentCountryCode: string;
  recoveryLaw: string;
  recoveryLegalTenantId: string;
  regulatedActivityNoteRequired: true;
};

export type RecoveryFallbackContext = {
  accessTenantId?: string | null;
  bookingTenantId?: string | null;
  hostTenantId?: string | null;
  membershipGoverningLaw?: string | null;
  membershipLegalTenantId?: string | null;
};

export type RecoveryLawResolution =
  | {
      outcome: 'recovery_law_resolved';
      incidentCountryCode: string;
      recoveryLaw: string;
      recoveryLegalTenantId: string;
      regulatedActivityNoteRequired: true;
      posture: 'recovery_available';
      reason: null;
      declineReason: null;
    }
  | {
      outcome: typeof RECOVERY_UNSUPPORTED_REASON;
      incidentCountryCode: string | null;
      recoveryLaw: null;
      recoveryLegalTenantId: null;
      regulatedActivityNoteRequired: true;
      posture: 'guidance_only';
      reason: typeof RECOVERY_UNSUPPORTED_REASON;
      declineReason: typeof RECOVERY_NO_NETWORK_DECLINE_REASON;
    };

export type RecoveryLawClaimValues = Pick<
  RecoveryLawResolution,
  'recoveryLaw' | 'recoveryLegalTenantId'
>;

export const DEFAULT_RECOVERY_JURISDICTIONS = [
  {
    incidentCountryCode: 'XK',
    recoveryLaw: 'XK',
    recoveryLegalTenantId: 'tenant_ks',
    regulatedActivityNoteRequired: true,
  },
  {
    incidentCountryCode: 'MK',
    recoveryLaw: 'MK',
    recoveryLegalTenantId: 'tenant_mk',
    regulatedActivityNoteRequired: true,
  },
] as const satisfies readonly RecoveryJurisdictionConfig[];

const COUNTRY_CODE = /^[A-Z]{2}$/u;

function normalizeCountryCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && COUNTRY_CODE.test(normalized) ? normalized : null;
}

function normalizeConfig(config: RecoveryJurisdictionConfig) {
  const incidentCountryCode = normalizeCountryCode(config.incidentCountryCode);
  const recoveryLaw = normalizeCountryCode(config.recoveryLaw);
  const recoveryLegalTenantId = config.recoveryLegalTenantId.trim();

  if (!incidentCountryCode || !recoveryLaw || !recoveryLegalTenantId) {
    return null;
  }

  return {
    incidentCountryCode,
    recoveryLaw,
    recoveryLegalTenantId,
    regulatedActivityNoteRequired: config.regulatedActivityNoteRequired,
  };
}

export function resolveRecoveryLaw(args: {
  incidentCountryCode?: string | null;
  jurisdictions?: readonly RecoveryJurisdictionConfig[];
  fallbackContext?: RecoveryFallbackContext;
}): RecoveryLawResolution {
  const incidentCountryCode = normalizeCountryCode(args.incidentCountryCode);
  const jurisdictions = args.jurisdictions ?? DEFAULT_RECOVERY_JURISDICTIONS;
  const match = jurisdictions
    .map(normalizeConfig)
    .find(config => config?.incidentCountryCode === incidentCountryCode);

  if (incidentCountryCode && match) {
    return {
      outcome: 'recovery_law_resolved',
      incidentCountryCode,
      recoveryLaw: match.recoveryLaw,
      recoveryLegalTenantId: match.recoveryLegalTenantId,
      regulatedActivityNoteRequired: true,
      posture: 'recovery_available',
      reason: null,
      declineReason: null,
    };
  }

  return {
    outcome: RECOVERY_UNSUPPORTED_REASON,
    incidentCountryCode,
    recoveryLaw: null,
    recoveryLegalTenantId: null,
    regulatedActivityNoteRequired: true,
    posture: 'guidance_only',
    reason: RECOVERY_UNSUPPORTED_REASON,
    declineReason: RECOVERY_NO_NETWORK_DECLINE_REASON,
  };
}

export function recoveryLawClaimValues(resolution: RecoveryLawResolution): RecoveryLawClaimValues {
  return {
    recoveryLaw: resolution.recoveryLaw,
    recoveryLegalTenantId: resolution.recoveryLegalTenantId,
  };
}

export function recoveryJurisdictionFromLawPack(lawPack: LawPack): RecoveryJurisdictionConfig {
  return {
    incidentCountryCode: lawPack.countryCode,
    recoveryLaw: lawPack.recoveryLaw,
    recoveryLegalTenantId: lawPack.recoveryLegalTenantId,
    regulatedActivityNoteRequired: lawPack.regulatedActivityNoteRequired,
  };
}
