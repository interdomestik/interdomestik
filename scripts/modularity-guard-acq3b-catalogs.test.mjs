import assert from 'node:assert/strict';
import test from 'node:test';
import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

const ACQ3B_CATALOGS = [
  'agent-members.json',
  'nav.json',
  'sponsors.json',
  'sponsorOptOut.json',
  'sponsorTasks.json',
];

test('ACQ-3b sponsor seats own the canonical sponsor locale catalogs', () => {
  for (const catalog of ACQ3B_CATALOGS) {
    for (const locale of ['de', 'en', 'mk', 'sq', 'sr']) {
      assert.equal(
        structuredArtifactOwner(`apps/web/src/messages/${locale}/${catalog}`),
        'acq-3b-sponsor-i18n-contract'
      );
    }
    assert.equal(structuredArtifactOwner(`apps/web/src/messages/hr/${catalog}`), null);
  }
});
