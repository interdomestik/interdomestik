import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LOCALE_CATALOG_OWNER_KEYS, structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const MESSAGES_DIR = fileURLToPath(new URL('../../apps/web/src/messages/', import.meta.url));
const LOCALES_SOURCE = fileURLToPath(
  new URL('../../apps/web/src/i18n/locales.ts', import.meta.url)
);
const ICU_TOKEN =
  /(?<!(?:zero|one|two|few|many|other|=\d+)\s*)\{\s*[A-Za-z_]\w*\s*[,}]|<\/?[A-Za-z][\w-]*>|,\s*(?:plural|select|selectordinal)\s*,/gu;

const catalogNames = locale =>
  fs
    .readdirSync(path.join(MESSAGES_DIR, locale))
    .filter(name => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

const readCatalog = (locale, name) =>
  JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, locale, name), 'utf8'));

function leaves(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leaves(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [[prefix, value]];
}

const tokens = text =>
  [...String(text).matchAll(ICU_TOKEN)].map(match => match[0].replaceAll(/\s+/gu, '')).sort();

test('de is a routed locale', () => {
  const source = fs.readFileSync(LOCALES_SOURCE, 'utf8');
  assert.match(source, /export const LOCALES = \[[^\]]*'de'[^\]]*\] as const;/u);
});

test('de ships exactly the en catalog files', () => {
  assert.deepEqual(catalogNames('de'), catalogNames('en'));
});

test('every de catalog has the en key paths, value types and ICU tokens', () => {
  for (const name of catalogNames('en')) {
    const english = new Map(leaves(readCatalog('en', name)));
    const german = new Map(leaves(readCatalog('de', name)));
    assert.deepEqual([...german.keys()].sort(), [...english.keys()].sort(), `${name} key paths`);
    for (const [key, value] of english) {
      const translated = german.get(key);
      assert.equal(typeof translated, typeof value, `${name}:${key} type`);
      if (typeof value !== 'string') continue;
      assert.ok(value === '' || translated.trim() !== '', `${name}:${key} is empty`);
      assert.deepEqual(tokens(translated), tokens(value), `${name}:${key} ICU tokens`);
    }
  }
});

test('every de catalog has an explicit modularity owner', () => {
  for (const name of catalogNames('de')) {
    const englishOwner = structuredArtifactOwner(`apps/web/src/messages/en/${name}`);
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/de/${name}`),
      englishOwner ?? 'de-locale-catalog-contract',
      name
    );
  }
  for (const name of ['agent.json', 'freeStart.json', 'pricing.json']) {
    assert.notEqual(structuredArtifactOwner(`apps/web/src/messages/en/${name}`), null, name);
  }
});

test('every de catalog file has an explicit owner-registry entry', () => {
  const keys = new Set(LOCALE_CATALOG_OWNER_KEYS);
  for (const name of catalogNames('de')) {
    assert.ok(keys.has(name) || keys.has(`de/${name}`), `${name} has no registry entry`);
  }
  for (const key of LOCALE_CATALOG_OWNER_KEYS.filter(entry => entry.startsWith('de/'))) {
    assert.ok(catalogNames('de').includes(key.slice(3)), `${key} names no de catalog`);
    assert.ok(!keys.has(key.slice(3)), `${key} duplicates a locale-wide entry`);
  }
  assert.equal(LOCALE_CATALOG_OWNER_KEYS.filter(entry => entry.startsWith('de/')).length, 48);
});

test('unknown de catalogs and unknown locales stay unowned', () => {
  for (const name of ['unknown.json', 'common-extra.json', 'nested/common.json']) {
    assert.equal(structuredArtifactOwner(`apps/web/src/messages/de/${name}`), null, name);
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/hr/common.json'), null);
});

test('the de catalog contract does not widen ownership of other locales', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr']) {
    const common = structuredArtifactOwner(`apps/web/src/messages/${locale}/common.json`);
    assert.notEqual(common, 'de-locale-catalog-contract', `${locale}/common.json`);
    assert.equal(structuredArtifactOwner(`apps/web/src/messages/${locale}/admin.json`), null);
  }
  const sqAuth = structuredArtifactOwner('apps/web/src/messages/sq/auth.json');
  assert.notEqual(sqAuth, 'de-locale-catalog-contract');
});
