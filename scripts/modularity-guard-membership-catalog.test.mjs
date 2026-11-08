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
