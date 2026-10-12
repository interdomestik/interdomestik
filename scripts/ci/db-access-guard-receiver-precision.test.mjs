import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  scan,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

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
