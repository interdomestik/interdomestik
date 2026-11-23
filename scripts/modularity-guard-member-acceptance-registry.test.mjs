import assert from 'node:assert/strict';
import test from 'node:test';

import { structuredArtifactOwner } from './modularity-guard-policy.mjs';

test('the WP-13 member-acceptance entry registry has its structured owner', () => {
  assert.equal(
    structuredArtifactOwner('apps/web/src/lib/privacy/member-acceptance-entries.json'),
    'wp13-entry-registry'
  );
});

test('the owner covers only that exact registry file', () => {
  for (const path of [
    'apps/web/src/lib/privacy/other-entries.json',
    'apps/web/src/lib/privacy/member-acceptance-entries.json.bak',
    'apps/web/src/lib/member-acceptance-entries.json',
  ]) {
    assert.equal(structuredArtifactOwner(path), null);
  }
});

test('WP-13 legal catalogues and the document version registry have structured owners', () => {
  for (const locale of ['de', 'en', 'mk', 'sq', 'sr']) {
    for (const name of ['legal-acceptance', 'legal-documents']) {
      const path = `apps/web/src/messages/${locale}/${name}.json`;
      assert.equal(structuredArtifactOwner(path), 'wp13-legal-i18n-contract', path);
    }
  }
  assert.equal(
    structuredArtifactOwner('packages/database/src/legal-document-versions.json'),
    'wp13-legal-document-versions-contract'
  );
});

test('WP-13 legal ownership is limited to the five locales and exact JSON paths', () => {
  for (const path of [
    'apps/web/src/messages/hr/legal-acceptance.json',
    'apps/web/src/messages/fr/legal-documents.json',
    'apps/web/src/messages/en/legal-other.json',
    'apps/web/src/messages/en/legal-documents.json.bak',
    'apps/web/src/messages/en/archive/legal-acceptance.json',
    'packages/database/src/legal-document-versions.json.bak',
    'packages/database/legal-document-versions.json',
  ]) {
    assert.equal(structuredArtifactOwner(path), null, path);
  }
});
