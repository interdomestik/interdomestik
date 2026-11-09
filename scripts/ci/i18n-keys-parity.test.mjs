import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const MESSAGES_DIR = fileURLToPath(new URL('../../apps/web/src/messages/', import.meta.url));
const LOCALES = ['en', 'sq', 'mk', 'sr', 'de'];
const catalogNames = locale =>
  fs
    .readdirSync(path.join(MESSAGES_DIR, locale), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort();

function keyPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    return [fullPath, ...keyPaths(child, fullPath)];
  });
}

const files = new Map(LOCALES.map(locale => [locale, catalogNames(locale)]));
const namespaces = [...new Set([...files.values()].flat())].sort();

test('catalog discovery is non-empty for every locale, so parity cannot pass vacuously', () => {
  for (const locale of LOCALES) {
    assert.ok(files.get(locale).length > 0, `${locale}: no namespace catalogs discovered`);
  }
  assert.ok(namespaces.length > 0, 'no namespace catalogs discovered');
});

for (const locale of LOCALES) {
  test(`${locale} ships every namespace and no extra namespace`, () => {
    const missing = namespaces.filter(name => !files.get(locale).includes(name));
    assert.deepEqual(missing, [], `${locale}: missing namespace files: ${missing.join(', ')}`);
  });
}

for (const namespace of namespaces) {
  test(`${namespace} has identical nested key sets in all five locales`, () => {
    const keys = new Map();
    for (const locale of LOCALES) {
      const file = path.join(MESSAGES_DIR, locale, namespace);
      assert.ok(fs.existsSync(file), `${locale}/${namespace}: missing namespace file`);
      let catalog;
      try {
        catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (error) {
        assert.fail(`${locale}/${namespace}: ${error.message}`);
      }
      keys.set(locale, new Set(keyPaths(catalog)));
    }
    const allKeys = [...new Set([...keys.values()].flatMap(paths => [...paths]))].sort();
    const differences = LOCALES.flatMap(locale => {
      const missing = allKeys.filter(key => !keys.get(locale).has(key));
      return missing.length ? [`${locale}/${namespace}: missing keys: ${missing.join(', ')}`] : [];
    });
    assert.deepEqual(differences, [], differences.join('\n'));
  });
}

test('the parity repair owns exactly the catalogs it changed without another owner', () => {
  const owned = [
    'en/auth',
    'mk/auth',
    'sr/auth',
    'mk/services',
    'sr/services',
    'mk/trust',
    'sr/trust',
  ];
  for (const name of owned) {
    const file = `apps/web/src/messages/${name}.json`;
    assert.equal(structuredArtifactOwner(file), 'i18n-keys-parity-contract', name);
  }
  for (const name of ['sq/auth', 'en/services', 'sq/trust', 'hr/auth']) {
    assert.notEqual(
      structuredArtifactOwner(`apps/web/src/messages/${name}.json`),
      'i18n-keys-parity-contract',
      name
    );
  }
});
