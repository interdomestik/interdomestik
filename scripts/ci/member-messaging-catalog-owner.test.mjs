import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('member messaging catalogs have an exact five-locale owner', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr', 'de']) {
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/messaging.json`),
      'member-case-communication-i18n-contract'
    );
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/hr/messaging.json'), null);
});

function assertScalarCopy(copy, locale) {
  for (const [key, value] of Object.entries(copy)) {
    if (key === 'handoffs') continue;
    assert.ok(typeof value === 'string' && value.trim(), `${locale}: ${key} must be nonempty text`);
  }
}

test('only handoffs is exempt from scalar copy validation', () => {
  assert.doesNotThrow(() => assertScalarCopy({ title: 'Title', handoffs: {} }, 'en'));
  for (const invalid of [null, {}, [], '', '   ', 1, false, undefined]) {
    assert.throws(() => assertScalarCopy({ title: invalid, handoffs: {} }, 'en'));
  }
});

// D1c-1 shares the existing messaging.json LOCALE_CATALOG_OWNERS entry.
test('branch-manager metadata copy has the exact allowlisted keys in all five catalogs', () => {
  const keys = [
    'title',
    'restriction',
    'count',
    'lastMessageAt',
    'awaitingReply',
    'yes',
    'no',
    'noTimestamp',
    'empty',
    'unavailable',
    'failed',
    'retry',
    'loading',
    'history',
    'handoffs',
  ].sort();
  for (const locale of ['en', 'sq', 'mk', 'sr', 'de']) {
    const catalog = JSON.parse(
      readFileSync(
        new URL(`../../apps/web/src/messages/${locale}/messaging.json`, import.meta.url),
        'utf8'
      )
    );
    const copy = catalog.messaging.branchManager;
    assert.deepEqual(Object.keys(copy).sort(), keys);
    assertScalarCopy(copy, locale);
    assert.notEqual(copy.empty, copy.unavailable);
    assert.notEqual(copy.failed, copy.unavailable);
    assert.notEqual(copy.failed, copy.empty);
  }
});
