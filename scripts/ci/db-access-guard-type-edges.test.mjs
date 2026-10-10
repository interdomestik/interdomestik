import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const ERASED = [
  'import type {Foo} from "./dep";',
  'import type Foo from "./dep";',
  'import type * as ns from "./dep";',
  'import {type Foo} from "./dep";',
  'import {type Foo, type Bar} from "./dep";',
  'export type {Foo} from "./dep";',
  'export type * from "./dep";',
  'export {type Foo} from "./dep";',
  'export {type Foo, type Bar} from "./dep";',
];
const RUNTIME = [
  'import {type Foo, value} from "./dep";',
  'import {value} from "./dep";',
  'import "./dep";',
  'import {} from "./dep";',
  'import * as ns from "./dep";',
  'import def from "./dep";',
  'import def, {type Foo} from "./dep";',
  'export {type Foo, value} from "./dep";',
  'export {value} from "./dep";',
  'export {} from "./dep";',
  'export * from "./dep";',
  'export * as ns from "./dep";',
  'export const load=()=>import("./dep");',
];

// Evaluator: unchanged consumer with historical ambient debt, dependency runtime change.
const CONSUMER = 'apps/web/src/legacy/consumer.ts';
const DEP = 'apps/web/src/legacy/dep.ts';
const depSource = version => [
  'export type Foo={id:string};',
  'export type Bar={id:string};',
  `export const value=${version};`,
  'export default value;',
];
function changeDependency(line) {
  const root = createTempRepo();
  writeFixture(root, DEP, depSource(1));
  writeFixture(root, CONSUMER, [
    line,
    'import {db} from "@interdomestik/database";',
    'export function read(){return db.select();}',
  ]);
  sealFixture(root);
  assert.equal(runGuard(root).status, 0, `baseline ${line}`);
  writeFixture(root, DEP, depSource(2));
  const result = runGuard(root);
  return { status: result.status, report: readReport(root) };
}

test('type-only module edges keep historical debt when the dependency runtime changes', () => {
  for (const line of ERASED) {
    const { status, report } = changeDependency(line);
    assert.equal(status, 0, `${line} ${JSON.stringify(report)}`);
    assert.equal(report.failingNewCount, 0, line);
  }
});

test('runtime module edges still invalidate unchanged consumers', () => {
  for (const line of RUNTIME) {
    const { status, report } = changeDependency(line);
    assert.equal(status, 1, line);
    assert.ok(
      report.failingNewEntries.some(entry => entry.file === CONSUMER),
      `${line} ${JSON.stringify(report)}`
    );
  }
});

// Graph: changed mounted file; the dependency's historical ambient top-level effect must be
// reached only through runtime edges.
const MOUNTED = 'packages/qa/src/server.ts';
const GRAPH_DEP = 'packages/qa/src/dep.ts';
function mount(line) {
  const root = createTempRepo();
  writeFixture(root, GRAPH_DEP, [
    'import {db} from "@interdomestik/database";',
    'export type Foo={id:string};',
    'export type Bar={id:string};',
    'export const value=1;',
    'export default value;',
    'export const effect=db.select();',
  ]);
  sealFixture(root);
  writeFixture(root, MOUNTED, [line, 'export const ok=true;']);
  const result = runGuard(root);
  return { status: result.status, report: readReport(root) };
}

test('graph does not initialize modules behind type-only import or export edges', () => {
  for (const line of ERASED) {
    const { status, report } = mount(line);
    assert.equal(status, 0, `${line} ${JSON.stringify(report)}`);
  }
});

test('graph still initializes modules behind runtime import and export edges', () => {
  for (const line of RUNTIME) {
    const { status, report } = mount(line);
    assert.equal(status, 1, line);
    assert.ok(
      report.failingNewEntries.some(
        entry => entry.file === GRAPH_DEP && entry.mountedFrom === MOUNTED
      ),
      `${line} ${JSON.stringify(report)}`
    );
  }
});
