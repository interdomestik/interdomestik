import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('cash approval catalogs have bounded ownership and localized pending-setup copy', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr', 'de']) {
    const path = `apps/web/src/messages/${locale}/admin-leads.json`;
    assert.equal(structuredArtifactOwner(path), 'cash-approval-fulfillment-i18n-contract');
    const catalog = JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
    const toasts = JSON.stringify(catalog).match(/"toasts":\{[^}]*\}/u)?.[0] ?? '';
    const copy = JSON.parse(toasts.slice('"toasts":'.length));
    const toastKeys = [
      'approve_success',
      'approve_fulfillment_pending',
      'approve_invite_pending',
      'resend_invite_success',
      'resend_invite_cooldown',
      'resend_invite_failed',
      'resend_invite_already_active',
    ];
    for (const key of toastKeys) {
      assert.equal(typeof copy[key], 'string', `${locale}.${key}`);
      assert.ok(copy[key].trim().length > 0, `${locale}.${key}`);
    }
    assert.notEqual(copy.approve_fulfillment_pending, copy.approve_success);
    assert.notEqual(copy.approve_invite_pending, copy.approve_success);
    assert.ok(catalog.admin.leads.actions.resend_invite.trim().length > 0, `${locale}.resend`);
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/hr/admin-leads.json'), null);
});

test('duplicate review copy (IDA-CRM-003) is complete and localized in every catalog', () => {
  const read = locale =>
    JSON.parse(
      fs.readFileSync(
        new URL(`../../apps/web/src/messages/${locale}/admin-leads.json`, import.meta.url),
        'utf8'
      )
    ).admin.leads.duplicates;
  const english = read('en');
  const keys = Object.keys(english).sort();
  assert.ok(keys.includes('keep_existing') && keys.includes('dismiss') && keys.includes('tab'));
  for (const locale of ['en', 'sq', 'mk', 'sr', 'de']) {
    const copy = read(locale);
    assert.deepEqual(Object.keys(copy).sort(), keys, locale);
    for (const key of keys) assert.ok(copy[key].trim().length > 0, `${locale}.${key}`);
    assert.match(copy.resolved_by, /\{name\}/u, `${locale}.resolved_by`);
    if (locale !== 'en') assert.notEqual(copy.tab, english.tab, `${locale}.tab`);
  }
});
