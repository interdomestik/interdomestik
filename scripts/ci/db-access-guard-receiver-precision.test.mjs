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

function assertPass(source, label) {
  const { result, report } = scan(source);
  assert.equal(result.status, 0, `${label}\n${JSON.stringify(report)}`);
  assert.equal(report.status, 'pass', label);
  assert.deepEqual(report.incomplete, [], label);
  return report;
}

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

test('URLSearchParams delete receivers remain unknown without a sealed runtime prototype', () => {
  for (const [label, source] of [
    [
      'stable alias',
      'export function clean(search){const params=new URLSearchParams(search);params.delete("page");return params.toString();}',
    ],
    [
      'direct receiver',
      'export function clean(search){new URLSearchParams(search).delete("page");return search;}',
    ],
    [
      'const alias chain',
      'export function clean(search){const first=new URLSearchParams(search);const second=first;second.delete("page");return second.toString();}',
    ],
  ]) {
    const report = assertFailClosed(source, label);
    assert.ok(
      report.failingNewEntries.some(entry => entry.method === 'delete') ||
        report.incomplete.some(entry => entry.reason.includes('receiver')),
      `${label}\n${JSON.stringify(report)}`
    );
  }
});

test('receiver proof does not trust names, annotations, shadows, reassignment or opaque use', () => {
  const cases = [
    [
      'shadowed constructor',
      'import {db} from "@interdomestik/database";function URLSearchParams(){return db;}export function clean(){return new URLSearchParams().delete(user);}',
    ],
    [
      'global constructor reassignment',
      'import {db} from "@interdomestik/database";URLSearchParams=db;export function clean(){return new URLSearchParams().delete(user);}',
    ],
    [
      'constructor alias',
      'const Params=URLSearchParams;export function clean(){return new Params().delete("page");}',
    ],
    [
      'prototype reassignment',
      'import {db} from "@interdomestik/database";URLSearchParams.prototype.delete=db.delete;export function clean(){return new URLSearchParams().delete(user);}',
    ],
    [
      'receiver reassignment',
      'import {db} from "@interdomestik/database";export function clean(){let params=new URLSearchParams();params=db;return params.delete(user);}',
    ],
    [
      'method reassignment',
      'import {db} from "@interdomestik/database";export function clean(){const params=new URLSearchParams();params.delete=db.delete;return params.delete(user);}',
    ],
    [
      'opaque receiver escape',
      'import {register} from "external-library";export function clean(){const params=new URLSearchParams();register(params);return params.delete("page");}',
    ],
    [
      'opaque factory receiver',
      'import {retrieve} from "external-library";export function clean(){return retrieve().delete("page");}',
    ],
    [
      'conditional receiver',
      'import {retrieve} from "external-library";export function clean(flag){const params=flag?new URLSearchParams():retrieve();return params.delete("page");}',
    ],
    [
      'injectable default receiver',
      'export function clean(params=new URLSearchParams()){return params.delete("page");}',
    ],
    [
      'type-only claim',
      'export function clean(params: URLSearchParams){return params.delete("page");}',
    ],
    [
      'name-only claim',
      'import {retrieve} from "external-library";export function clean(){const searchParams=retrieve();return searchParams.delete("page");}',
    ],
  ];
  for (const [label, source] of cases) assertFailClosed(source, label);
});

test('receiver proof rejects prototype mutation reached through any URLSearchParams instance', () => {
  const prefix = 'import {remove} from "external-library";';
  const suffix = 'export function clean(){return new URLSearchParams().delete("page");}';
  for (const [label, mutation] of [
    ['direct __proto__ computed write', 'new URLSearchParams().__proto__["delete"]=remove;'],
    [
      'constructor prototype computed write',
      'new URLSearchParams().constructor.prototype["delete"]=remove;',
    ],
    [
      'aliased __proto__ computed write',
      'const params=new URLSearchParams();params.__proto__["delete"]=remove;',
    ],
    [
      'Object.getPrototypeOf alias write',
      'const proto=Object.getPrototypeOf(new URLSearchParams());proto["delete"]=remove;',
    ],
    [
      'Object.assign prototype write',
      'Object.assign(Object.getPrototypeOf(new URLSearchParams()),{["delete"]:remove});',
    ],
    [
      'computed global constructor destructuring',
      'const {["URLSearchParams"]:ctor}=globalThis;ctor.prototype["delete"]=remove;',
    ],
  ])
    assertFailClosed(`${prefix}${mutation}${suffix}`, label);
});

test('cross-source URLSearchParams poisoning cannot make delete a proven non-DB call', () => {
  for (const [label, poison] of [
    [
      'prototype write in imported module',
      'import {remove} from "external-library";URLSearchParams.prototype["delete"]=remove;',
    ],
    [
      'constructor replacement in imported module',
      'import {Client} from "external-library";URLSearchParams=Client;',
    ],
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/poison.ts', poison);
    writeFixture(
      root,
      'apps/web/src/example.ts',
      'import "./poison";export function clean(){return new URLSearchParams().delete("page");}'
    );
    const result = runGuard(root);
    const report = readReport(root);
    assert.equal(result.status, 1, `${label}\n${JSON.stringify(report)}`);
    assert.notEqual(report.status, 'pass', label);
    assert.ok(
      report.failingNewEntries.some(entry => entry.method === 'delete') ||
        report.incomplete.some(entry => entry.reason.includes('receiver')),
      `${label}\n${JSON.stringify(report)}`
    );
  }
});

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

test('delete remains tenant-context only for the proven callback handle', () => {
  const scoped = assertPass(
    `import {withTenantContext} from "${DATABASE}";export function clean(){return withTenantContext({},tx=>tx.delete(user));}`,
    'canonical tenant transaction'
  );
  assert.ok(
    scoped.newEntries.some(
      entry => entry.method === 'delete' && entry.tenantPosture === 'tenant-context'
    )
  );

  for (const client of ['db', 'dbRls', 'dbAdmin']) {
    const report = assertFailClosed(
      `import {${client}} from "${DATABASE}";export function clean(){return ${client}.delete(user);}`,
      client
    );
    assert.ok(
      report.failingNewEntries.some(entry => entry.method === 'delete'),
      client
    );
  }
});

test('returned, thrown and yielded transaction containers remain rejected', () => {
  for (const [label, callback] of [
    ['returned', 'async tx=>({nested:[tx]})'],
    ['thrown', 'async tx=>{throw {nested:[tx]};}'],
    ['yielded', 'async function*(tx){yield {nested:[tx]};}'],
  ]) {
    const report = assertFailClosed(
      `import {withTenantContext} from "${DATABASE}";export function clean(){return withTenantContext({},${callback});}`,
      label
    );
    assert.ok(
      [...report.failingNewEntries, ...report.incomplete].some(entry =>
        /handle|tenant callback/u.test(entry.reason)
      ),
      `${label}\n${JSON.stringify(report)}`
    );
  }
});
