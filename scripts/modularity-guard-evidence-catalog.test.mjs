import assert from 'node:assert/strict';
import test from 'node:test';
import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

test('claim evidence upload copy has exact English catalog ownership', () => {
  assert.equal(
    structuredArtifactOwner('apps/web/src/messages/en/evidence.json'),
    'claim-evidence-file-upload-i18n-contract'
  );
  // The de catalog must follow the en owner (scripts/ci/de-locale-catalog.test.mjs).
  assert.equal(
    structuredArtifactOwner('apps/web/src/messages/de/evidence.json'),
    'claim-evidence-file-upload-i18n-contract'
  );
  for (const locale of ['mk', 'sq', 'sr']) {
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/evidence.json`),
      'locale-quality-pass-i18n-contract'
    );
  }
  for (const path of [
    'apps/web/src/messages/en/evidence-extra.json',
    'apps/web/src/messages/hr/evidence.json',
    'apps/web/src/messages/en/unowned.json',
  ])
    assert.equal(structuredArtifactOwner(path), null);
});
