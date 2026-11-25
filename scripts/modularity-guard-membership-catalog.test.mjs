import assert from 'node:assert/strict';
import test from 'node:test';
import { structuredArtifactOwner } from './modularity-guard-policy.mjs';
import './modularity-guard-acq3b-catalogs.test.mjs';

test('S6 member payment recovery owns the canonical membership locale catalogs', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/membership.json`),
      's6-member-payment-recovery-i18n-contract'
    );
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/hr/membership.json'), null);
});

test('T117B/member upload catalog ownership', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    const prefix = `apps/web/src/messages/${locale}/`;
    assert.deepEqual(
      ['dashboard.json', 'claims.json'].map(file => structuredArtifactOwner(prefix + file)),
      ['t117b-member-portal-i18n-contract', 'member-evidence-upload-locale-contract']
    );
  }

  for (const denied of [
    'apps/web/src/messages/hr/dashboard.json',
    'apps/web/src/messages/en/settings.json',
    'apps/web/src/messages/en/portal.json',
    'apps/web/src/messages/hr/claims.json',
  ]) {
    assert.equal(structuredArtifactOwner(denied), null, denied);
  }
});
