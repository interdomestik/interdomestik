import assert from 'node:assert/strict';
import test from 'node:test';
import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

test('bounded admin user recovery catalog ownership', () => {
  for (const locale of ['en', 'mk', 'sq', 'sr']) {
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/admin-users.json`),
      's7-admin-user-read-recovery-i18n-contract'
    );
  }
  for (const denied of [
    'apps/web/src/messages/de/admin-users.json',
    'apps/web/src/messages/en/admin.json',
  ]) {
    assert.equal(structuredArtifactOwner(denied), null);
  }
});
