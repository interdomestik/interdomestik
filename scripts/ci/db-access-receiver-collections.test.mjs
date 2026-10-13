import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scan } from './db-access-guard-test-utils.mjs';

test('stable local Set and Map delete calls do not masquerade as database deletes', () => {
  for (const body of [
    'const open = new Set(); open.delete(1);',
    'const cache = new Map(); cache.delete("key");',
    'const cache = new Map(); const alias = cache; alias.delete("key");',
  ]) {
    const { report, result } = scan(body);
    assert.equal(result.status, 0, `${body}: ${JSON.stringify(report.incomplete)}`);
    assert.equal(report.failingNewCount, 0, body);
    assert.deepEqual(report.incomplete, [], body);
  }
});

test('mutated, escaped, shadowed and mixed collection receivers remain unknown', () => {
  for (const body of [
    'const cache = new Map(); cache.delete = replacement; cache.delete("key");',
    'const cache = new Map(); const alias = cache; alias.delete = replacement; cache.delete("key");',
    'const cache = new Map(); unknown(cache); cache.delete("key");',
    'let cache = new Map(); cache = replacement; cache.delete("key");',
    'const Set = function() { return replacement; }; const open = new Set(); open.delete(1);',
    'const cache = condition ? new Map() : db; cache.delete("key");',
  ]) {
    const { report, result } = scan(body);
    assert.equal(result.status, 1, body);
    assert.ok(report.failingNewCount > 0 || report.incomplete.length > 0, body);
  }
});

test('collection identity does not excuse a tenant handle argument or adjacent ambient call', () => {
  const { report, result } = scan([
    'import { db, withTenantContext } from "@interdomestik/database";',
    'const cache = new Map();',
    'withTenantContext({}, tx => cache.delete(tx));',
    'db.select();',
  ]);
  assert.equal(result.status, 1);
  assert.ok(report.failingNewEntries.some(entry => entry.callee === 'db.select'));
  assert.ok(
    report.failingNewEntries.some(entry => entry.callee === 'cache.delete') ||
      report.incomplete.some(item => /tenant transaction handle/.test(item.reason))
  );
});
