import assert from 'node:assert/strict';
import test from 'node:test';

import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

test('T210 owns only the canonical member timeline locale catalogs', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    const path = `apps/web/src/messages/${locale}/claims-tracking.json`;
    assert.equal(structuredArtifactOwner(path), 't210-member-timeline-i18n-contract');
  }

  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/claims-tracking.json'), null);
  assert.equal(structuredArtifactOwner('apps/web/src/messages/en/unrelated.json'), null);
});
