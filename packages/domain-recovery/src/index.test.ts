import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_RECOVERY_JURISDICTIONS,
  DOMAIN_RECOVERY_BOUNDARY,
  RECOVERY_LEGAL_TENANT_FIELD,
  RECOVERY_LIFECYCLE_FIELD,
  RECOVERY_LAW_FIELD,
  recoveryLawClaimValues,
  resolveRecoveryLaw,
} from './index';

test('domain-recovery exposes a bounded recovery lifecycle contract', () => {
  assert.equal(DOMAIN_RECOVERY_BOUNDARY, 'domain-recovery');
  assert.equal(RECOVERY_LIFECYCLE_FIELD, 'claims.recovery_lifecycle_state');
  assert.equal(RECOVERY_LAW_FIELD, 'claims.recovery_law');
  assert.equal(RECOVERY_LEGAL_TENANT_FIELD, 'claims.recovery_legal_tenant_id');
});

test('resolves recovery law from explicit incident country', () => {
  const resolution = resolveRecoveryLaw({ incidentCountryCode: ' mk ' });

  assert.equal(resolution.outcome, 'recovery_law_resolved');
  assert.equal(resolution.incidentCountryCode, 'MK');
  assert.equal(resolution.recoveryLaw, 'MK');
  assert.equal(resolution.recoveryLegalTenantId, 'tenant_mk');
  assert.equal(resolution.regulatedActivityNoteRequired, true);
  assert.deepEqual(recoveryLawClaimValues(resolution), {
    recoveryLaw: 'MK',
    recoveryLegalTenantId: 'tenant_mk',
  });
});

test('unsupported recovery country never falls back to membership or host context', () => {
  const resolution = resolveRecoveryLaw({
    incidentCountryCode: 'CH',
    fallbackContext: {
      accessTenantId: 'tenant_access',
      bookingTenantId: 'tenant_booking',
      hostTenantId: 'tenant_host',
      membershipGoverningLaw: 'MK',
      membershipLegalTenantId: 'tenant_mk',
    },
  });

  assert.equal(resolution.outcome, 'no_network_or_unsupported_jurisdiction');
  assert.equal(resolution.posture, 'guidance_only');
  assert.equal(resolution.declineReason, 'no_network');
  assert.equal(resolution.recoveryLaw, null);
  assert.equal(resolution.recoveryLegalTenantId, null);
});

test('invalid country and invalid registry entries produce no-network routing', () => {
  const resolution = resolveRecoveryLaw({
    incidentCountryCode: 'Macedonia',
    jurisdictions: [
      {
        incidentCountryCode: 'DE',
        recoveryLaw: 'Germany',
        recoveryLegalTenantId: '',
        regulatedActivityNoteRequired: true,
      },
    ],
  });

  assert.equal(resolution.outcome, 'no_network_or_unsupported_jurisdiction');
  assert.equal(resolution.incidentCountryCode, null);
  assert.equal(DEFAULT_RECOVERY_JURISDICTIONS.length, 2);
});
