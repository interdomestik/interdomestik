import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { qualifyClosedDataBoundary } from './db-access-closed-data-source.mjs';
import { CLOSED_DATA_BOUNDARY } from './db-access-closed-data-policy.mjs';
import { CLOSED_DATA_FIXTURE } from './db-access-closed-data-fixture.mjs';
import { commit, git, tmp, writeFile } from './db-access-required-git.mjs';

const files = Object.keys(CLOSED_DATA_FIXTURE);
const raw = () => CLOSED_DATA_BOUNDARY.diagnostics.map(row => ({ ...row }));
function fixture() {
  const root = tmp('closed-data');
  git(root, 'init', '-q', '-b', 'main');
  for (const [file, text] of Object.entries(CLOSED_DATA_FIXTURE)) writeFile(root, file, text);
  commit(root, 'exact reviewed closed-data pair');
  return { root, model: { sources: new Map(Object.entries(CLOSED_DATA_FIXTURE)) } };
}
function inspect(fixture, rows = raw(), entries = []) {
  const graph = { incomplete: rows };
  const inventory = { entries };
  const result = qualifyClosedDataBoundary(fixture.root, fixture.model, inventory, graph);
  assert.equal(graph.incomplete, rows);
  assert.equal(inventory.entries, entries);
  return result;
}
function refused(fixture, rows = raw(), entries = []) {
  const result = inspect(fixture, rows, entries);
  assert.equal(result.qualification.status, 'unqualified');
  assert.deepEqual(result.qualification.resolvedDiagnostics, []);
  assert.equal(result.qualification.resolvedRawCount, 0);
  assert.equal(result.unresolvedIncomplete, rows);
}

test('only the committed exact pair resolves its complete finite witness multiset', () => {
  const f = fixture();
  const rows = raw();
  const result = inspect(f, rows);
  assert.equal(result.qualification.status, 'qualified');
  assert.equal(result.qualification.resolvedRawCount, 1251);
  assert.equal(result.qualification.resolvedDiagnostics.length, 35);
  assert.deepEqual(result.qualification.resolvedDiagnostics, rows);
  assert.deepEqual(result.unresolvedIncomplete, []);
  assert.equal(
    rows.reduce((sum, row) => sum + row.occurrences, 0),
    1251
  );
});

test('absent or partial pair supplies no qualification', () => {
  const f = fixture();
  f.model.sources.clear();
  const rows = raw();
  const result = inspect(f, rows);
  assert.equal(result.qualification.status, 'not-applicable');
  assert.equal(result.unresolvedIncomplete, rows);
  f.model.sources.set(files[0], CLOSED_DATA_FIXTURE[files[0]]);
  refused(f);
});

test('imports, loaders, callbacks, computed receivers and DB getters lose source eligibility', () => {
  for (const addition of [
    "\nimport { db } from '@interdomestik/database';\nexport const q = db.select();\n",
    "\nimport('node:fs');\n",
    '\nexport function invoke(callback: () => void) { callback(); }\n',
    '\nexport function computed(receiver: any, key: string) { receiver[key](); }\n',
    '\nconst getter = { get value() { return db.select(); } };\n',
    '\nconst TextEncoder = class { constructor() { db.select(); } };\n',
    '\n// Even inert foreign bytes require a reviewed contract revision.\n',
  ]) {
    const f = fixture();
    const changed = CLOSED_DATA_FIXTURE[files[0]] + addition;
    writeFile(f.root, files[0], changed);
    commit(f.root, 'foreign source bytes');
    f.model.sources.set(files[0], changed);
    refused(f);
  }
});

test('candidate test source containing DB execution receives no allowance', () => {
  const f = fixture();
  const changed = CLOSED_DATA_FIXTURE[files[1]] + '\nconst concealed = () => db.select();\n';
  writeFile(f.root, files[1], changed);
  commit(f.root, 'DB-bearing test bytes');
  f.model.sources.set(files[1], changed);
  refused(f, raw(), [{ file: files[1], method: 'select', tenantPosture: 'unclassified' }]);
});

test('model, disk and committed blob bytes must all agree', () => {
  const modelMismatch = fixture();
  modelMismatch.model.sources.set(files[0], 'model substitution');
  refused(modelMismatch);
  const diskMismatch = fixture();
  writeFile(diskMismatch.root, files[0], 'disk substitution');
  refused(diskMismatch);
  const commitMismatch = fixture();
  writeFile(commitMismatch.root, files[0], 'foreign committed blob');
  commit(commitMismatch.root, 'commit substitution');
  writeFile(commitMismatch.root, files[0], CLOSED_DATA_FIXTURE[files[0]]);
  refused(commitMismatch);
});

test('executable Git modes and symlink aliases cannot authenticate regular source', () => {
  const executable = fixture();
  git(executable.root, 'update-index', '--chmod=+x', '--', files[0]);
  git(executable.root, 'commit', '-qm', 'foreign executable mode');
  refused(executable);
  const alias = fixture();
  const target = path.join(alias.root, 'outside-source.ts');
  fs.writeFileSync(target, CLOSED_DATA_FIXTURE[files[0]]);
  fs.rmSync(path.join(alias.root, files[0]));
  fs.symlinkSync(target, path.join(alias.root, files[0]));
  commit(alias.root, 'symlink substitution');
  refused(alias);
});

test('missing, duplicate, additional, renamed or altered-count witnesses cannot be discharged', () => {
  const f = fixture();
  const original = raw();
  for (const rows of [
    original.slice(1),
    [...original, { ...original[0] }],
    [...original, { file: files[0], reason: 'unsupported dynamic loader', occurrences: 1 }],
    original.map((row, index) => (index ? row : { ...row, reason: 'foreign reason' })),
    original.map((row, index) => (index ? row : { ...row, occurrences: row.occurrences + 1 })),
  ])
    refused(f, rows);
});

test('qualification preserves unrelated roots, environment mutation and exhausted analysis', () => {
  const f = fixture();
  for (const outside of [
    { file: 'apps/web/src/server/contracts.ts', reason: 'ambient DB call', occurrences: 1 },
    { file: '<analysis>', reason: 'provenance-work-bound', occurrences: 1 },
    { file: 'other.ts', reason: 'unsupported mutable global environment root', occurrences: 1 },
  ]) {
    const rows = [...raw(), outside];
    const result = inspect(f, rows);
    assert.equal(result.qualification.status, 'qualified');
    assert.deepEqual(result.unresolvedIncomplete, [outside]);
    assert.equal(rows.at(-1), outside);
  }
  refused(f, [
    ...raw(),
    { file: files[0], reason: 'unsupported mutable global environment root', occurrences: 1 },
  ]);
});

test('every inventoried boundary operation prevents qualification and remains intact', () => {
  const f = fixture();
  for (const file of files) {
    const entries = [
      { file, method: 'select', tenantPosture: 'tenant-context', identity: 'retained-operation' },
    ];
    refused(f, raw(), entries);
    assert.equal(entries[0].identity, 'retained-operation');
  }
});
