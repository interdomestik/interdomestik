import assert from 'node:assert/strict';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('member messaging catalogs have an exact four-locale owner', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr']) {
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/messaging.json`),
      'member-case-communication-i18n-contract'
    );
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/messaging.json'), null);
});
