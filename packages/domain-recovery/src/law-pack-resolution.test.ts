import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UnsupportedLawPackCountryError,
  resolveRecoveryLawFromLawPack,
  type LawPack,
} from './index';

const mkLawPack = {
  countryCode: 'MK',
  recoveryLaw: 'MK',
  recoveryLegalTenantId: 'tenant_mk',
  regulatedActivityNoteRequired: true,
  owner: 'domain-recovery-test',
  effectiveFrom: '2026-06-13',
  lastReviewed: '2026-06-13',
  sourceReferences: ['test:mk'],
} satisfies LawPack;

test('resolves recovery law from an injected law pack', async () => {
  const resolution = await resolveRecoveryLawFromLawPack({
    incidentCountryCode: 'MK',
    loadLawPack: async countryCode => {
      assert.equal(countryCode, 'MK');
      return mkLawPack;
    },
  });

  assert.equal(resolution.outcome, 'recovery_law_resolved');
  assert.equal(resolution.incidentCountryCode, 'MK');
  assert.equal(resolution.recoveryLaw, 'MK');
  assert.equal(resolution.recoveryLegalTenantId, 'tenant_mk');
  assert.equal(resolution.posture, 'recovery_available');
});

test('T-208b unsupported incident country cannot fall back to tenant or session context', async () => {
  const requestedCountries: Array<string | null | undefined> = [];

  const resolution = await resolveRecoveryLawFromLawPack({
    incidentCountryCode: 'CH',
    // @ts-expect-error T-208b proves fallback context is not an accepted input.
    fallbackContext: {
      accessTenantId: 'tenant_access',
      bookingTenantId: 'tenant_booking',
      hostTenantId: 'tenant_host',
      membershipGoverningLaw: 'MK',
      membershipLegalTenantId: 'tenant_mk',
      sessionCountryCode: 'MK',
      sessionTenantId: 'tenant_session',
      tenantCountryCode: 'MK',
      tenantId: 'tenant_default',
    },
    loadLawPack: async countryCode => {
      requestedCountries.push(countryCode);
      throw new UnsupportedLawPackCountryError('CH');
    },
  });

  assert.deepEqual(requestedCountries, ['CH']);
  assert.equal(resolution.outcome, 'no_network_or_unsupported_jurisdiction');
  assert.equal(resolution.incidentCountryCode, 'CH');
  assert.equal(resolution.posture, 'guidance_only');
  assert.equal(resolution.declineReason, 'no_network');
  assert.equal(resolution.recoveryLaw, null);
  assert.equal(resolution.recoveryLegalTenantId, null);
  assert.notEqual(resolution.recoveryLaw, 'MK');
  assert.notEqual(resolution.recoveryLegalTenantId, 'tenant_mk');
  assert.notEqual(resolution.recoveryLegalTenantId, 'tenant_booking');
  assert.notEqual(resolution.recoveryLegalTenantId, 'tenant_host');
  assert.notEqual(resolution.recoveryLegalTenantId, 'tenant_access');
  assert.notEqual(resolution.recoveryLegalTenantId, 'tenant_default');
  assert.notEqual(resolution.recoveryLegalTenantId, 'tenant_session');
});

test('unexpected law-pack loader errors propagate', async () => {
  const loaderError = new Error('law-pack loader failed');

  await assert.rejects(
    resolveRecoveryLawFromLawPack({
      incidentCountryCode: 'MK',
      loadLawPack: async () => {
        throw loaderError;
      },
    }),
    error => error === loaderError
  );
});
