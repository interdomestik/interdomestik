import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const MESSAGES_DIR = new URL('../../apps/web/src/messages/', import.meta.url);

// JSON.parse keeps the last of two equal keys, so a duplicated object silently drops the first
// one's entries (EN admin.branches.health lost its labels this way). Scan the raw text instead.
export function duplicateKeys(source) {
  const found = [];
  const scopes = [];
  let index = 0;
  const readString = () => {
    let value = '';
    for (index += 1; source[index] !== '"'; index += 1) {
      if (source[index] === '\\') index += 1;
      value += source[index];
    }
    index += 1;
    return value;
  };
  while (index < source.length) {
    const char = source[index];
    if (char === '{') scopes.push({ object: true, keys: new Set() });
    if (char === '[') scopes.push({ object: false });
    if (char === '}' || char === ']') scopes.pop();
    if (char !== '"') {
      index += 1;
      continue;
    }
    const value = readString();
    const scope = scopes.at(-1);
    const isKey = scope?.object && /^\s*:/u.test(source.slice(index, index + 8));
    if (!isKey) continue;
    if (scope.keys.has(value)) found.push(value);
    scope.keys.add(value);
  }
  return found;
}

test('the duplicate scanner ignores braces and quotes inside values', () => {
  assert.deepEqual(duplicateKeys('{"a": "{x} \\"a\\": 1", "b": {"a": 1}, "c": ["a"]}'), []);
  assert.deepEqual(duplicateKeys('{"a": {"x": 1}, "a": {"y": 1}}'), ['a']);
});

test('no locale catalog repeats a key within one object', () => {
  const offenders = [];
  const locales = fs
    .readdirSync(MESSAGES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory());
  assert.ok(locales.length >= 4, 'scans every locale directory');
  for (const { name: locale } of locales) {
    const dir = new URL(`${locale}/`, MESSAGES_DIR);
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
      const keys = duplicateKeys(fs.readFileSync(new URL(file, dir), 'utf8'));
      if (keys.length) offenders.push(`${path.join(locale, file)}: ${keys.join(', ')}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('this contract owns the branch catalogs it repaired', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr']) {
    const file = `apps/web/src/messages/${locale}/admin-branches.json`;
    assert.equal(structuredArtifactOwner(file), 'locale-catalog-integrity-contract', file);
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/admin-branches.json'), null);
});
