import { describe, expect, it } from 'vitest';

import {
  decideResidenceCountryChange,
  isPersistedResidenceChangeDecision,
  residenceChangeEventPayload,
  residenceCountryChangeSchema,
} from './residence-country-policy';

describe('residence country change policy', () => {
  it('normalizes valid ISO-2 residence-country input', () => {
    expect(residenceCountryChangeSchema.parse({ residenceCountry: ' de ' })).toEqual({
      residenceCountry: 'DE',
    });
  });

  it('rejects non-ISO residence-country input', () => {
    expect(() => residenceCountryChangeSchema.parse({ residenceCountry: 'Germany' })).toThrow(
      /Residence country must be ISO 3166 alpha-2/
    );
  });

  it('keeps unchanged residence as no-op without migration or terms action', () => {
    expect(
      decideResidenceCountryChange({
        activeRecoveryClaimCount: 0,
        fromResidenceCountry: 'DE',
        termsVersionAccepted: '2026-06-v1',
        toResidenceCountry: 'DE',
      })
    ).toMatchObject({
      activeRecoveryRunoff: false,
      changeState: 'unchanged',
      migrationDecision: 'not_started',
      termsAction: 'none',
      termsVersionAccepted: '2026-06-v1',
    });
  });

  it('defers re-acceptance and migration to renewal without active recovery', () => {
    const decision = decideResidenceCountryChange({
      activeRecoveryClaimCount: 0,
      fromResidenceCountry: 'DE',
      termsVersionAccepted: '2026-06-v1',
      toResidenceCountry: 'AT',
    });

    expect(decision).toMatchObject({
      activeRecoveryRunoff: false,
      changeState: 'pending_terms_reacceptance',
      dsrDecision: 'standard_dsr_with_erasure_render',
      migrationDecision: 'defer_to_renewal',
      termsAction: 'require_reacceptance_before_renewal',
      termsAcceptanceState: 'accepted_snapshot_present',
    });
  });

  it('runs off active recovery instead of force-migrating non-terminal recovery', () => {
    const decision = decideResidenceCountryChange({
      activeRecoveryClaimCount: 2,
      fromResidenceCountry: 'DE',
      termsVersionAccepted: null,
      toResidenceCountry: 'AT',
    });

    expect(decision).toMatchObject({
      activeRecoveryClaimCount: 2,
      activeRecoveryRunoff: true,
      changeState: 'deferred_active_recovery_runoff',
      dsrDecision: 'legal_hold_run_off_until_recovery_terminal',
      migrationDecision: 'run_off_legacy_entity_until_recovery_terminal',
      termsAction: 'defer_reacceptance_until_recovery_terminal',
      termsAcceptanceState: 'missing_acceptance_snapshot',
    });
  });

  it('builds event evidence without deriving tenant, host, legal entity, or billing state', () => {
    const decision = decideResidenceCountryChange({
      activeRecoveryClaimCount: 1,
      fromResidenceCountry: 'DE',
      termsVersionAccepted: '2026-06-v1',
      toResidenceCountry: 'AT',
    });

    expect(isPersistedResidenceChangeDecision(decision)).toBe(true);
    if (!isPersistedResidenceChangeDecision(decision))
      throw new Error('Expected persisted decision');
    expect(Object.keys(residenceChangeEventPayload(decision)).sort()).toEqual([
      'activeRecoveryClaimCount',
      'activeRecoveryRunoff',
      'changeState',
      'dsrDecision',
      'fromResidenceCountry',
      'migrationDecision',
      'termsAcceptanceState',
      'termsAction',
      'termsVersionAccepted',
      'toResidenceCountry',
    ]);
  });
});
