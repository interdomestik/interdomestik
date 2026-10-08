import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('claims read recovery catalogs have bounded ownership and complete localized result copy', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr']) {
    const path = `apps/web/src/messages/${locale}/admin-claims.json`;
    assert.equal(structuredArtifactOwner(path), 's7-admin-claims-read-consistency-i18n-contract');
    const catalog = JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
    const copy = catalog.admin.claims_page;
    for (const key of ['read_failed', 'read_result']) {
      assert.equal(typeof copy[key], 'string');
      assert.ok(copy[key].trim().length > 0);
    }
    assert.ok(copy.read_result.includes('{count}'));
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/admin-claims.json'), null);
  assert.equal(structuredArtifactOwner('apps/web/src/messages/en/admin.json'), null);
});
