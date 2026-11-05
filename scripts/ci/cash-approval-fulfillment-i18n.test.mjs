import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('cash approval catalogs have bounded ownership and localized pending-setup copy', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr']) {
    const path = `apps/web/src/messages/${locale}/admin-leads.json`;
    assert.equal(structuredArtifactOwner(path), 'cash-approval-fulfillment-i18n-contract');
    const catalog = JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
    const toasts = JSON.stringify(catalog).match(/"toasts":\{[^}]*\}/u)?.[0] ?? '';
    const copy = JSON.parse(toasts.slice('"toasts":'.length));
    for (const key of ['approve_success', 'approve_fulfillment_pending']) {
      assert.equal(typeof copy[key], 'string', `${locale}.${key}`);
      assert.ok(copy[key].trim().length > 0, `${locale}.${key}`);
    }
    assert.notEqual(copy.approve_fulfillment_pending, copy.approve_success);
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/admin-leads.json'), null);
});
