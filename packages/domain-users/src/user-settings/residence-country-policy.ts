import { z } from 'zod';

const ISO_COUNTRY = /^[A-Z]{2}$/u;

export const residenceCountryChangeSchema = z
  .object({
    residenceCountry: z
      .string()
      .trim()
      .transform(value => value.toUpperCase())
      .refine(value => ISO_COUNTRY.test(value), 'Residence country must be ISO 3166 alpha-2'),
  })
  .strict();

export type ResidenceCountryChangeInput = z.input<typeof residenceCountryChangeSchema>;

export type ResidenceChangeState =
  | 'unchanged'
  | 'pending_terms_reacceptance'
  | 'deferred_active_recovery_runoff';

export type ResidenceTermsAction =
  | 'none'
  | 'require_reacceptance_before_renewal'
  | 'defer_reacceptance_until_recovery_terminal';

export type ResidenceMigrationDecision =
  | 'not_started'
  | 'defer_to_renewal'
  | 'run_off_legacy_entity_until_recovery_terminal';

export type ResidenceDsrDecision =
  | 'standard_dsr_with_erasure_render'
  | 'legal_hold_run_off_until_recovery_terminal';

export type ResidenceTermsAcceptanceState =
  | 'accepted_snapshot_present'
  | 'missing_acceptance_snapshot';

export type ResidenceChangeDecision = {
  activeRecoveryClaimCount: number;
  activeRecoveryRunoff: boolean;
  changeState: ResidenceChangeState;
  dsrDecision: ResidenceDsrDecision;
  fromResidenceCountry: string | null;
  migrationDecision: ResidenceMigrationDecision;
  termsAcceptanceState: ResidenceTermsAcceptanceState;
  termsAction: ResidenceTermsAction;
  termsVersionAccepted: string | null;
  toResidenceCountry: string;
};

export type PersistedResidenceChangeDecision = ResidenceChangeDecision & {
  changeState: Exclude<ResidenceChangeState, 'unchanged'>;
  migrationDecision: Exclude<ResidenceMigrationDecision, 'not_started'>;
  termsAction: Exclude<ResidenceTermsAction, 'none'>;
};

export function isPersistedResidenceChangeDecision(
  decision: ResidenceChangeDecision
): decision is PersistedResidenceChangeDecision {
  return (
    decision.changeState !== 'unchanged' &&
    decision.migrationDecision !== 'not_started' &&
    decision.termsAction !== 'none'
  );
}

export function decideResidenceCountryChange(input: {
  activeRecoveryClaimCount: number;
  fromResidenceCountry: string | null;
  termsVersionAccepted?: string | null;
  toResidenceCountry: string;
}): ResidenceChangeDecision {
  const activeRecoveryClaimCount = Math.max(0, input.activeRecoveryClaimCount);
  const activeRecoveryRunoff = activeRecoveryClaimCount > 0;
  const termsVersionAccepted = input.termsVersionAccepted?.trim() || null;
  const termsAcceptanceState: ResidenceTermsAcceptanceState = termsVersionAccepted
    ? 'accepted_snapshot_present'
    : 'missing_acceptance_snapshot';

  if (input.fromResidenceCountry === input.toResidenceCountry) {
    return {
      activeRecoveryClaimCount,
      activeRecoveryRunoff: false,
      changeState: 'unchanged',
      dsrDecision: 'standard_dsr_with_erasure_render',
      fromResidenceCountry: input.fromResidenceCountry,
      migrationDecision: 'not_started',
      termsAcceptanceState,
      termsAction: 'none',
      termsVersionAccepted,
      toResidenceCountry: input.toResidenceCountry,
    };
  }

  if (activeRecoveryRunoff) {
    return {
      activeRecoveryClaimCount,
      activeRecoveryRunoff: true,
      changeState: 'deferred_active_recovery_runoff',
      dsrDecision: 'legal_hold_run_off_until_recovery_terminal',
      fromResidenceCountry: input.fromResidenceCountry,
      migrationDecision: 'run_off_legacy_entity_until_recovery_terminal',
      termsAcceptanceState,
      termsAction: 'defer_reacceptance_until_recovery_terminal',
      termsVersionAccepted,
      toResidenceCountry: input.toResidenceCountry,
    };
  }

  return {
    activeRecoveryClaimCount,
    activeRecoveryRunoff: false,
    changeState: 'pending_terms_reacceptance',
    dsrDecision: 'standard_dsr_with_erasure_render',
    fromResidenceCountry: input.fromResidenceCountry,
    migrationDecision: 'defer_to_renewal',
    termsAcceptanceState,
    termsAction: 'require_reacceptance_before_renewal',
    termsVersionAccepted,
    toResidenceCountry: input.toResidenceCountry,
  };
}

export function residenceChangeEventPayload(decision: PersistedResidenceChangeDecision) {
  return {
    activeRecoveryClaimCount: decision.activeRecoveryClaimCount,
    activeRecoveryRunoff: decision.activeRecoveryRunoff,
    changeState: decision.changeState,
    dsrDecision: decision.dsrDecision,
    fromResidenceCountry: decision.fromResidenceCountry,
    migrationDecision: decision.migrationDecision,
    termsAcceptanceState: decision.termsAcceptanceState,
    termsAction: decision.termsAction,
    termsVersionAccepted: decision.termsVersionAccepted,
    toResidenceCountry: decision.toResidenceCountry,
  };
}
