import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  scan,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const DATABASE = '@interdomestik/database';

function assertFailClosed(source, label) {
  const { result, report } = scan(source);
  assert.equal(result.status, 1, `${label}\n${JSON.stringify(report)}`);
  assert.notEqual(report.status, 'pass', label);
  assert.ok(
    report.failingNewEntries.length > 0 || report.incomplete.length > 0,
    `${label}\n${JSON.stringify(report)}`
  );
  return report;
}

test('source-local methods stay unknown after own-property deletion and prototype replacement', () => {
  const source = `
import * as database from '@interdomestik/database';
import { sql } from 'drizzle-orm';
(Object.prototype as Record<string, unknown>)['execute'] = database.db['execute'];
const dto = { execute(statement: unknown) { return statement; } };
delete (dto as Partial<typeof dto>)['execute'];
export function run() { return dto.execute(sql\`select 1\`); }
`;
  const report = assertFailClosed(source, 'same-file prototype replacement');
  assert.ok(
    report.failingNewEntries.some(entry => entry.callee === 'dto.execute') ||
      report.incomplete.some(entry => entry.reason.includes('dto.execute')),
    JSON.stringify(report)
  );

  const root = createTempRepo();
  writeFixture(
    root,
    'apps/web/src/poison.ts',
    `import * as database from '@interdomestik/database';
(Object.prototype as Record<string, unknown>)['execute'] = database.db['execute'];`
  );
  writeFixture(
    root,
    'apps/web/src/example.ts',
    `import './poison';
import { sql } from 'drizzle-orm';
const dto = { execute(statement: unknown) { return statement; } };
delete (dto as Partial<typeof dto>)['execute'];
export function run() { return dto.execute(sql\`select 1\`); }`
  );
  const result = runGuard(root);
  const crossSource = readReport(root);
  assert.equal(result.status, 1, JSON.stringify(crossSource));
  assert.notEqual(crossSource.status, 'pass');
  assert.ok(
    crossSource.failingNewEntries.some(entry => entry.callee === 'dto.execute') ||
      crossSource.incomplete.some(entry => entry.reason.includes('dto.execute')),
    JSON.stringify(crossSource)
  );
});

test('source-local dispatch cannot hide a transaction stored through an invoked setter', () => {
  const report = assertFailClosed(
    `import { withTenantContext } from "${DATABASE}";
type Client = { select(): unknown };
const state: { client: Client } = { client: { select() { return 1; } } };
const local = { select() { return state.client.select(); } };
export async function run(): Promise<unknown> {
  await withTenantContext({}, async tx => {
    ({ set x(v: { target: typeof state; client: Client }) { v.target['client'] = v.client; } }).x = { target: state, client: tx };
  });
  return local.select();
}`,
    'setter transaction escape'
  );
  assert.ok(
    report.failingNewEntries.some(entry =>
      ['local.select', 'state.client.select'].includes(entry.callee)
    ) || report.incomplete.some(entry => /local\.select|state\.client\.select/u.test(entry.reason)),
    JSON.stringify(report)
  );
});

test('source-local dispatch cannot hide ambient DB stored through an invoked setter', () => {
  const report = assertFailClosed(
    `import * as database from "${DATABASE}";
import { sql } from 'drizzle-orm';
const state: { client: any } = { client: { execute(_input: unknown) { return 1; } } };
const local = { execute(input: unknown) { return state.client.execute(input); } };
({ set x(v: { target: typeof state; client: any }) { v.target['client'] = v.client; } }).x = { target: state, client: database.db };
export function run(): unknown { return local.execute(sql\`select 1\`); }`,
    'setter ambient DB escape'
  );
  assert.ok(
    report.failingNewEntries.some(entry =>
      ['local.execute', 'state.client.execute'].includes(entry.callee)
    ) ||
      report.incomplete.some(entry => /local\.execute|state\.client\.execute/u.test(entry.reason)),
    JSON.stringify(report)
  );
});

test('optional, computed and extracted delete capabilities remain unsupported', () => {
  for (const [label, body] of [
    ['optional receiver', 'return params?.delete("page");'],
    ['optional call', 'return params.delete?.("page");'],
    ['computed call', 'return params["delete"]("page");'],
    ['extracted method', 'const remove=params.delete;return remove("page");'],
    ['bound method', 'const remove=params.delete.bind(params);return remove("page");'],
  ])
    assertFailClosed(`export function clean(){const params=new URLSearchParams();${body}}`, label);
});

test('source-resolved DTO delete methods stay unknown even when their bodies carry no DB capability', () => {
  const safeBody = assertFailClosed(
    'function dto(){return {delete(value){return {removed:value};}};}export function clean(){return dto().delete("page");}',
    'plain DTO'
  );
  assert.ok(
    safeBody.failingNewEntries.some(entry => entry.method === 'delete') ||
      safeBody.incomplete.some(entry => entry.reason.includes('receiver'))
  );

  const unsafe = assertFailClosed(
    `import {db} from "${DATABASE}";function dto(){return {delete(){return db.delete(user);}};}export function clean(){return dto().delete();}`,
    'DTO carrying ambient DB capability'
  );
  assert.ok(unsafe.failingNewEntries.some(entry => entry.callee === 'db.delete'));
});
