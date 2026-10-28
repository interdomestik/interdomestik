import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha } from './db-access-m4-compiled-context.fixture.mjs';
import { historyFixture } from './db-access-m4-compiled-context-history.fixture.mjs';
import { retainCompiledHistoricalRelations } from './db-access-m4-compiled-context-history.mjs';
import { extractCompiledTrustedOperations } from './db-access-m4-compiled-context-source.mjs';
test('required source operations precede native observations and retain exact property spans', () => {
  const text = 'export async function work(tx) { return tx.select().from(table); }';
  const rows = extractCompiledTrustedOperations('a.ts', text);
  assert.equal(rows.length, 1);
  assert.equal(text.slice(rows[0].operation[1], rows[0].operation[2]).trim(), 'tx.select');
  assert.equal(rows[0].method, 'select');
});
test('top-level privileged construction cannot be assigned a made-up owner', () =>
  assert.throws(
    () => extractCompiledTrustedOperations('a.ts', 'const value = tx.select();'),
    /unowned privileged operation/
  ));
test('source syntax refusal', () =>
  assert.throws(
    () => extractCompiledTrustedOperations('a.ts', 'function x( {'),
    /trusted source parse/
  ));
test('private sink consumes compiled result only at acceptance; required phases are sequential', () => {
  const text = readFileSync(new URL('./db-access-m4-runtime-pairing.mjs', import.meta.url), 'utf8');
  const run = text.slice(
    text.indexOf('export async function executeM4Pairing'),
    text.indexOf('export function assertM4Pairing')
  );
  assert(
    run.indexOf('runtime = runM4Runtime') < run.indexOf('compiled = await executeM4CompiledRuntime')
  );
  assert(
    run.indexOf('compiled = await executeM4CompiledRuntime') <
      run.indexOf('prior = startM4PriorPreparation')
  );
  assert(!run.includes('takeM4CompiledRuntimeForJoin('));
  assert(text.includes('databaseUrl: input.compiledDatabaseUrl'));
  assert.equal((text.match(/takeM4CompiledRuntimeForJoin\(/g) || []).length, 1);
});

test('historical original anchors remain preserved residuals and do not mint whole-ID acceptance', () => {
  const f = historyFixture(),
    before = JSON.stringify(f),
    r = retainCompiledHistoricalRelations(f.native, f.relation, f.source);
  assert.equal(JSON.stringify(f), before);
  assert.equal(r.purposeRelations.length, 5);
  assert.deepEqual(r.originalTAndSWholeIdentityAcceptance, []);
  assert(r.purposeRelations.every(row => row.wholeOriginalIdentityQualified === false));
  assert.equal(r.affectedSelection.entries.length, 5);
  assert.equal(r.namespace.planningMembershipIsRuntimeAuthority, false);
});
for (const [name, mutate] of Object.entries({
  'missing original witness': f =>
    f.native.rawGraph.m4Contexts.affectedLineage.selection.entries.pop(),
  'changed old source': f =>
    (f.native.rawGraph.m4Contexts.affectedLineage.selection.sites[0].sourceSha256 = 'b'.repeat(64)),
  'changed original operation': f => {
    const r = f.native.rawGraph.m4Contexts.affectedLineage.selection.entries[0];
    r.operation = [...r.operation];
    r.operation[1]++;
  },
  'missing counterpart effect': f => (f.relation.references = []),
}))
  test(name, () => {
    const f = historyFixture();
    mutate(f);
    assert.throws(
      () => retainCompiledHistoricalRelations(f.native, f.relation, f.source),
      /M4 compiled context correspondence refused/
    );
  });

test('computed or unknown database callees refuse rather than disappear from the required set', () => {
  for (const source of [
    'function x(tx){tx["select"]()}',
    'function x(database){database.arbitrary()}',
  ])
    assert.throws(
      () => extractCompiledTrustedOperations('a.ts', source),
      /unsupported.*database callee/
    );
});
test('Hash.update and Set.delete are not automatically privileged database methods', () => {
  const rows = extractCompiledTrustedOperations(
    'a.ts',
    'function x(tx){createHash("sha256").update("x");active.delete(token);return tx.select()}'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].method, 'select');
});
