import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const MESSAGES_DIR = new URL('../../apps/web/src/messages/', import.meta.url);

// JSON.parse keeps the last of two equal keys, so a duplicated object silently drops the first
// one's entries (EN admin.branches.health lost its labels this way). Scan the raw text instead.
// The text must already be valid JSON; keys compare by their decoded value (`h` is `h`).
export function duplicateKeys(source) {
  JSON.parse(source);
  const found = [];
  const scopes = [];
  let index = 0;
  const readString = () => {
    const start = index;
    for (index += 1; index < source.length && source[index] !== '"'; index += 1) {
      if (source[index] === '\\') index += 1;
    }
    if (index >= source.length) throw new SyntaxError('Unterminated string');
    index += 1;
    return JSON.parse(source.slice(start, index));
  };
  const nextIsColon = () => {
    let cursor = index;
    while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
    return source[cursor] === ':';
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
    if (!scope?.object || !nextIsColon()) continue;
    if (scope.keys.has(value)) found.push(value);
    scope.keys.add(value);
  }
  return found;
}

test('the duplicate scanner ignores braces and quotes inside values', () => {
  assert.deepEqual(duplicateKeys('{"a": "{x} \\"a\\": 1", "b": {"a": 1}, "c": ["a"]}'), []);
  assert.deepEqual(duplicateKeys('{"a": {"x": 1}, "a": {"y": 1}}'), ['a']);
});

test('the duplicate scanner compares decoded keys across any whitespace', () => {
  assert.deepEqual(duplicateKeys('{"health": 1, "\\u0068ealth": 2}'), ['health']);
  assert.deepEqual(duplicateKeys('{"health": 1, "health"          \n : 2}'), ['health']);
});

test('the duplicate scanner refuses invalid JSON instead of scanning it', () => {
  assert.throws(() => duplicateKeys('{"a": "unterminated'), SyntaxError);
  assert.throws(() => duplicateKeys('{"a": 1,}'), SyntaxError);
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
  for (const locale of ['en', 'sq', 'mk', 'sr', 'de']) {
    const file = `apps/web/src/messages/${locale}/admin-branches.json`;
    assert.equal(structuredArtifactOwner(file), 'locale-catalog-integrity-contract', file);
  }
  assert.equal(structuredArtifactOwner('apps/web/src/messages/hr/admin-branches.json'), null);
});

test('single-branch limit copy is owned, present and consistent across the five branch catalogs', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr', 'de']) {
    const catalog = JSON.parse(
      fs.readFileSync(new URL(`${locale}/admin-branches.json`, MESSAGES_DIR), 'utf8')
    );
    const message = catalog.admin.branches.single_branch_limit;
    assert.equal(typeof message, 'string', locale);
    assert.ok(message.trim().length > 20, locale);
    assert.equal(/[{}]/.test(message), false, 'no unbound ICU placeholders');
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/admin-branches.json`),
      'locale-catalog-integrity-contract'
    );
  }
});
