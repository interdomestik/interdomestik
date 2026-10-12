import assert from 'node:assert/strict';
import test from 'node:test';
import { scan } from './db-access-guard-test-utils.mjs';

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

test('stable unshadowed URLSearchParams delete calls are proven non-DB receivers', () => {
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
    const report = assertPass(source, label);
    assert.equal(report.scannedCount, 0, label);
    assert.equal(report.newCount, 0, label);
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

test('source-resolved DTO delete methods are safe only while their bodies carry no DB capability', () => {
  const safe = assertPass(
    'function dto(){return {delete(value){return {removed:value};}};}export function clean(){return dto().delete("page");}',
    'plain DTO'
  );
  assert.equal(safe.failingNewCount, 0);

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
