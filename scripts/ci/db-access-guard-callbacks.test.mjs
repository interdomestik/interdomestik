import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const legacy = [
  'import {db} from "@interdomestik/database";',
  'export function old(){return db.select().from(user);}',
  'export function safe(){return "safe";}',
];

test('named callbacks passed to map, timers and external higher-order calls remount old ambient debt', () => {
  for (const body of [
    'return [1].map(old);',
    'return setTimeout(old,1);',
    'return higherOrder(old);',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/legacy.ts', legacy);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/app/page.tsx', [
      'import {old} from "../legacy";',
      'import {higherOrder} from "external-library";',
      `export default function Page(){${body}}`,
    ]);
    assert.equal(runGuard(root).status, 1, body);
    assert.ok(readReport(root).failingNewEntries.some(entry => entry.file.endsWith('legacy.ts')));
  }
});

test('safe named callback body passes while unresolved callback forwarding fails incomplete', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/legacy.ts', legacy);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/app/page.tsx', [
    'import {safe} from "../legacy";',
    'export default function Page(){return [1].map(safe);}',
  ]);
  assert.equal(runGuard(root).status, 0);
  writeFixture(
    root,
    'apps/web/src/app/page.tsx',
    'export default function Page(callback){return setTimeout(callback,1);}'
  );
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).incomplete[0].reason, /forwarded callback/u);
});

test('JSX props invoking received callback properties are unsupported, never silently safe', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/legacy.ts', legacy);
  writeFixture(
    root,
    'apps/web/src/component.tsx',
    'export function LegacyComponent(props){return props.onLoad();}'
  );
  sealFixture(root);
  writeFixture(root, 'apps/web/src/app/page.tsx', [
    'import {old} from "../legacy";',
    'import {LegacyComponent} from "../component";',
    'export default function Page(){return <LegacyComponent onLoad={old}/>;}',
  ]);
  assert.equal(runGuard(root).status, 1);
  assert.ok(
    readReport(root).incomplete.some(item => /received property executable/u.test(item.reason))
  );
});

test('v1 reproduced mutation, reflection and reference remounts cannot silently pass', () => {
  const candidates = [
    'let f=()=>"safe"; f=old; export default function Page(){return f();}',
    'const box={run(){return "safe";}};box.run=old;export default function Page(){return box.run();}',
    'import {pgEnum} from "drizzle-orm/pg-core";let f=pgEnum("x",["a"]);f=old;export default function Page(){return f();}',
    'import {relations} from "drizzle-orm";export const x=relations(user,({many})=>{many=old;return many();});',
    'import {pgTable} from "drizzle-orm/pg-core";export const x=pgTable("x",{},t=>{t={id:{asc:old}};return t.id.asc();});',
    'export default function Page(){return (old)();}',
    'export default function Page(){return (old as any)();}',
    'export default function Page(){return (0,old)();}',
    'export default function Page(){return (true?old:()=>"safe")();}',
    'export default function Page(){return old.call(null);}',
    'export default function Page(){return old.apply(null,[]);}',
    'export default function Page(){return old.bind(null)();}',
    'export default function Page(){return Reflect.apply(old,null,[]);}',
    'export default function Page(){return old`tag`;}',
    'const Old=old;export default function Page(){return <Old/>;}',
    'const box={run:old};export default function Page(){return box.run();}',
    'export default function Page(){return <button onClick={old}/>;}',
    'import {External} from "external-library";export default function Page(){return <External onLoad={old}/>;}',
    'import {higherOrder} from "external-library";export default function Page(){return higherOrder({run:old});}',
    'export default function Page({rows=old()}){return rows;}',
    'export default old;',
    'export const GET=old;',
    'export {old as GET} from "../legacy";',
    'export default function Page(){return new Legacy();}',
    'export default function Page(){return repo.item;}',
  ];
  for (const body of candidates) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/legacy.ts', [
      ...legacy,
      'export class Legacy{constructor(){db.select();}}',
      'export const repo={get item(){return db.select();}};',
    ]);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/app/page.tsx', [
      'import {old,Legacy,repo} from "../legacy";',
      body,
    ]);
    assert.equal(runGuard(root).status, 1, body);
    const report = readReport(root);
    assert.ok(report.incomplete.length || report.failingNewEntries.length, body);
  }
});

test('escaped injectable helper and scheduled nested owner cannot inherit a safe direct caller', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/helper.ts', 'export function leaf(tx){return tx.select();}');
  writeFixture(root, 'apps/web/src/caller.ts', [
    'import {withTenantContext} from "@interdomestik/database";',
    'import {leaf} from "./helper";',
    'export function run(){return withTenantContext({},async tx=>leaf(tx));}',
  ]);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/app/page.ts', [
    'import {leaf} from "../helper";',
    'export default function Page(){return [client].map(leaf);}',
  ]);
  assert.equal(runGuard(root).status, 1);
  const scheduled = createTempRepo();
  writeFixture(scheduled, 'apps/web/src/example.ts', [
    'import {withTenantContext} from "@interdomestik/database";',
    'export function run(){return withTenantContext({},async tx=>{const read=()=>tx.select();setTimeout(()=>read(),0);});}',
  ]);
  assert.equal(runGuard(scheduled).status, 1);
});
