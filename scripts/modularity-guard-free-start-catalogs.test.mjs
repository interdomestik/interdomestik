import assert from 'node:assert/strict';
import test from 'node:test';

import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

test('S5 local disclosure owns only canonical Free Start locale catalogs', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    const path = `apps/web/src/messages/${locale}/freeStart.json`;
    assert.equal(structuredArtifactOwner(path), 's5-local-draft-disclosure-i18n-contract');
  }

  assert.equal(structuredArtifactOwner('apps/web/src/messages/hr/freeStart.json'), null);
  assert.equal(structuredArtifactOwner('apps/web/src/messages/en/freeStart-extra.json'), null);
});

test('Free Start terminology pass owns only its exact non-English catalogs', () => {
  const owner = 'free-start-terminology-i18n-contract';
  const shared = ['freeStartResult.json', 'injuryJourney.json', 'propertyJourney.json'];
  const extra = ['commercialTerms.json', 'coverageMatrix.json', 'servicesPage.json'];
  const owned = { mk: [...shared, ...extra], sq: shared, sr: [...shared, ...extra] };
  for (const [locale, names] of Object.entries(owned)) {
    for (const name of names) {
      assert.equal(structuredArtifactOwner(`apps/web/src/messages/${locale}/${name}`), owner);
    }
  }
  for (const name of ['freeStartResult.json', 'injuryJourney.json', ...extra]) {
    assert.equal(structuredArtifactOwner(`apps/web/src/messages/en/${name}`), null);
  }
});
