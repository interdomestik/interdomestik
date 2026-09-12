import assert from 'node:assert/strict';
import test from 'node:test';

import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

test('T410 owns only the canonical notification locale catalogs', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    const path = `apps/web/src/messages/${locale}/notifications.json`;
    assert.equal(structuredArtifactOwner(path), 't410-notification-acknowledgement-i18n-contract');
  }

  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/notifications.json'), null);
  assert.equal(structuredArtifactOwner('apps/web/src/messages/en/unrelated.json'), null);
});
