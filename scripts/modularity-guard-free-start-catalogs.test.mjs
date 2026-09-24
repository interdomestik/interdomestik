import assert from 'node:assert/strict';
import test from 'node:test';

import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

test('S5 local disclosure owns only canonical Free Start locale catalogs', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    const path = `apps/web/src/messages/${locale}/freeStart.json`;
    assert.equal(structuredArtifactOwner(path), 's5-local-draft-disclosure-i18n-contract');
  }

  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/freeStart.json'), null);
  assert.equal(structuredArtifactOwner('apps/web/src/messages/en/freeStart-extra.json'), null);
});
