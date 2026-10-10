import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  scan,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const PAGE = 'apps/web/src/app/page.ts';
const CONTEXT = 'import {withTenantContext} from "@interdomestik/database";';
const EXTERNAL = 'import {register, retrieve} from "external-library";';
const inCallback = body => [
  CONTEXT,
  `export function read(){return withTenantContext({},async tx=>{${body}});}`,
];
const withCallback = (callback, extra = []) => [
  CONTEXT,
  ...extra,
  `export function read(){return withTenantContext({},${callback});}`,
];

function assertRejected(
  lines,
  label,
  reason = /handle|unsupported tenant callback|unsupported received property/
) {
  const { result, report } = scan(lines, PAGE);
  assert.equal(result.status, 1, label);
  assert.notEqual(report.status, 'pass', label);
  assert.ok(
    [...report.failingNewEntries, ...report.incomplete].some(item => reason.test(item.reason)),
    `${label}\n${JSON.stringify(report)}`
  );
}
function assertAccepted(lines, label) {
  const { result, report } = scan(lines, PAGE);
  assert.equal(result.status, 0, `${label}\n${JSON.stringify(report)}`);
}

test('mutated containers cannot return a handle through a stale initializer', () => {
  for (const body of [
    'const box={};box.tx=tx;return box;',
    'const box={};box["tx"]=tx;return box;',
    'const key="tx";const box={};box[key]=tx;return box;',
    'let box;box={tx};return box;',
    'let box={};box={...box,tx};return box;',
    'const box={};Object.assign(box,{tx});return box;',
    'const box={};const alias=box;alias.tx=tx;return box;',
  ])
    assertRejected(inCallback(body), body);
});

test('unchanged mutated-container debt is historical until remounted', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/legacy.ts', inCallback('const box={};box.tx=tx;return box;'));
  sealFixture(root);
  assert.equal(runGuard(root).status, 0);
  writeFixture(
    root,
    PAGE,
    'import {read} from "../legacy";export default async function Page(){return (await read()).tx.futureOperation();}'
  );
  assert.equal(runGuard(root).status, 1);
  const report = readReport(root);
  assert.ok(report.failingNewEntries.length || report.incomplete.length);
});

test('handles inside containers given to opaque callees are escapes', () => {
  for (const argument of ['{tx}', '[tx]', 'tx.query', 'true?tx:null', '{nested:[tx]}', '...[tx]'])
    assertRejected(
      [
        CONTEXT,
        EXTERNAL,
        `export function read(){return withTenantContext({},async tx=>{register(${argument});});}`,
      ],
      argument
    );
  assertRejected(
    [
      CONTEXT,
      EXTERNAL,
      'export async function read(){',
      '  await withTenantContext({}, async tx => { register({tx}); });',
      '  return retrieve().tx.futureOperation();',
      '}',
    ],
    'container argument then call-result receiver'
  );
  assertRejected(
    inCallback('const held=new Map([["tx",tx]]);return held.size;'),
    'constructor handle container'
  );
  assertAccepted(
    [
      CONTEXT,
      EXTERNAL,
      'export function read(){return withTenantContext({},async tx=>{register({id:1});return tx.select().from(user);});}',
    ],
    'external call without a handle'
  );
});

test('prototype member hops cannot launder opaque handle arguments through operators or builders', () => {
  for (const call of [
    'register(box)',
    'eq.call.call(register,null,box)',
    'tx.select().from.call.call(register,null,box)',
  ])
    assertRejected(
      [
        CONTEXT,
        EXTERNAL,
        'import {eq} from "drizzle-orm";',
        `export function read(){return withTenantContext({},async tx=>{const box={};box.tx=tx;${call};return 1;});}`,
      ],
      call
    );
  assertAccepted(
    [
      CONTEXT,
      'import {eq as equal} from "drizzle-orm";',
      'export function read(){return withTenantContext({},async tx=>tx.select().from(user).where(equal(user.id,"owner")));}',
    ],
    'direct imported operator alias'
  );
  for (const method of ['findFirst', 'findMany'])
    assertAccepted(
      inCallback(`return tx.query.user.${method}();`),
      `canonical relational ${method}`
    );
});

test('yield, yield* and throw are handle escape channels', () => {
  for (const callback of [
    'async function*(tx){yield tx;}',
    'async function*(tx){yield {tx};}',
    'function*(tx){yield* [tx];}',
    'async tx=>{throw tx;}',
    'async tx=>{throw {tx};}',
  ])
    assertRejected(withCallback(callback), callback);
  assertRejected(
    [
      CONTEXT,
      'export async function read(){',
      '  return (await (await withTenantContext({}, async function*(tx){ yield {tx}; })).next()).value.tx.futureOperation();',
      '}',
    ],
    'yielded container then call-result receiver'
  );
  assertRejected(
    [
      CONTEXT,
      'export async function read(){return (await (await withTenantContext({},async function*(tx){yield tx;})).next()).value.futureOperation();}',
    ],
    'direct yielded handle then call-result receiver'
  );
  assertAccepted(withCallback('async tx=>{throw "denied";}'), 'throw without a handle');
  assertAccepted('export function* ids(){yield 1;}', 'non-canonical generator without a handle');
});

test('unlisted methods on call-result, await and parenthesized receivers fail closed', () => {
  for (const body of [
    'return retrieve().futureOperation();',
    'return (retrieve()).futureOperation();',
    'return retrieve().nested.futureOperation();',
  ])
    assertRejected([EXTERNAL, `export function read(){${body}}`], body);
  assertRejected(
    [EXTERNAL, 'export async function read(){return (await retrieve()).futureOperation();}'],
    'await-result receiver'
  );
});

test('local factories cannot launder an unresolved external member', () => {
  assertRejected(
    [
      EXTERNAL,
      'function make(){return retrieve();}export function read(){return make().futureOperation();}',
    ],
    'local wrapper opaque member'
  );
});

test('resolved local and canonical query chains remain valid receivers', () => {
  assertAccepted(
    'function box(){return {run(){return "safe";}};}export function read(){return box().run();}',
    'sync local call-result'
  );
  // The noLib model does not resolve this async result member: explicit incomplete is conservative.
  assertRejected(
    'async function box(){return {run(){return "safe";}};}export async function read(){return (await box()).run();}',
    'unsupported awaited async local call-result',
    /unsupported received property/
  );
  assertAccepted(inCallback('return tx.select().from(user).limit(1);'), 'canonical query chain');
  assertAccepted(
    'import {pgEnum} from "drizzle-orm/pg-core";export const status=pgEnum("status",["open","closed"]);',
    'pgEnum'
  );
});

test('opaque tagged templates reject mutated handle containers; resolved harmless tags pass', () => {
  assertRejected(
    [
      CONTEXT,
      'import {tag} from "external-library";',
      'export function read(){return withTenantContext({},async tx=>{const box={};box.tx=tx;tag`${box}`;});}',
    ],
    'opaque tagged mutated handle'
  );
  assertAccepted(
    'function tag(){return "safe";}export function read(){return tag`${1}`;}',
    'resolved harmless tag'
  );
});

test('branch work exhaustion is incomplete for new and remounted evidence, historical otherwise', () => {
  const aliases = [
    'const a0=0;',
    ...Array.from({ length: 12 }, (_, i) => `const a${i + 1}=[a${i},a${i}];`),
  ].join('');
  const source = `export function read(){${aliases}return a12;}`;
  assertRejected(source, 'new branch budget exhaustion', /handle analysis bound/);
  assertRejected(
    source.replaceAll(/\[a(\d+),a\1\]/g, '{left:a$1,right:a$1}'),
    'object branch budget exhaustion',
    /handle analysis bound/
  );
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/legacy.ts', source);
  sealFixture(root);
  assert.equal(runGuard(root).status, 0, JSON.stringify(readReport(root)));
  writeFixture(
    root,
    PAGE,
    'import {read} from "../legacy";export default function Page(){return read();}'
  );
  assert.equal(runGuard(root).status, 1);
  assert.ok(readReport(root).incomplete.some(item => /handle analysis bound/.test(item.reason)));
});
