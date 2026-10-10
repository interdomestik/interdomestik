import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateSnapshot } from './db-access-trust.mjs';
import {
  createTempRepo,
  readReport,
  rootDir,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

// Read actual authenticated Git objects, never candidate helper bytes or credentials.
test('actual root database helper closure admits new canonical context and db operations', () => {
  const root = createTempRepo();
  const trusted = authenticateSnapshot(rootDir);
  for (const [file, content] of trusted)
    if (file.startsWith('packages/database/')) writeFixture(root, file, content);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/app/page.ts', [
    'import {withTenantContext, withTenantDb, eq, and, user} from "@interdomestik/database";',
    'export async function first(){return withTenantContext({tenantId:"ks"},async tx=>tx.query.user.findFirst());}',
    'export async function second(owner:string){return withTenantDb({tenantId:"ks"},async tx=>tx.select().from(user).where(and(eq(user.id,owner),eq(user.active,true))));}',
  ]);
  const result = runGuard(root);
  assert.equal(result.status, 0, JSON.stringify(readReport(root).incomplete.slice(0, 12)));
  assert.ok(readReport(root).counts.byTenantPosture['tenant-context'] >= 2);
});

test('destructured assignment and Object mutation cannot retain canonical tx provenance', () => {
  for (const body of [
    '[tx]=[db];return tx.query.user.findMany();',
    '({tx}={tx:db});return tx.query.user.findMany();',
    'const box={tx};Object.assign(box,{tx:db});return box.tx.query.user.findMany();',
    'unknownMutator(tx);return tx.query.user.findMany();',
    'const box={tx};unknownMutator(box);return box.tx.query.user.findMany();',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/example.ts', [
      'import {db,withTenantContext} from "@interdomestik/database";',
      `export function run(){return withTenantContext({},async tx=>{${body}});}`,
    ]);
    const result = runGuard(root);
    assert.equal(result.status, 1, body);
    assert.ok(
      readReport(root).failingNewEntries.length || readReport(root).incomplete.length,
      body
    );
  }
});

test('bootstrap DSL support never accepts arbitrary external factories or callback properties', () => {
  for (const body of [
    'import {factory} from "external-library"; const f=factory(); export const value=f();',
    'import {factory} from "external-library"; factory(props=>props.onLoad());',
    'import {relations} from "drizzle-orm"; relations(user,props=>props.onLoad());',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/example.ts', body);
    assert.equal(runGuard(root).status, 1, body);
    assert.ok(readReport(root).incomplete.length, body);
  }
});

test('environment primitive support rejects supplied objects, mutation and shadowed process', () => {
  for (const source of [
    'function read(env=process.env){return env.X?.trim();} export const value=read(custom);',
    'function read(env=process.env){Object.assign(env,custom);return env.X?.trim();} export const value=read();',
    'const process=custom; function read(env=process.env){return env.X?.trim();} export const value=read();',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/example.ts', source);
    assert.equal(runGuard(root).status, 1, source);
    assert.ok(readReport(root).incomplete.length, source);
  }
});

test('v1 client escape, indirect methods, local mutation and loop writes fail closed', () => {
  for (const body of [
    '(db.select)();',
    'db.select.call(db);',
    'Reflect.apply(db.select,db,[]);',
    'Function.prototype.call.call(db.select,db);',
    'Reflect.get(db,"select").call(db);',
    'const {query}=dbAdmin;query.claims.findMany();',
    'register(dbAdmin);',
    'dbRls.transaction=dbAdmin.transaction;withTenantContext({},async tx=>tx.select());',
    'withTenantContext({},async tx=>{for(tx of [db])return tx.select();});',
    'function poison(box){box.tx=db;}withTenantContext({},async tx=>{const box={tx};poison(box);return box.tx.select();});',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/example.ts', [
      'import {db,dbAdmin,dbRls,withTenantContext} from "@interdomestik/database";',
      'import {register} from "external-library";',
      body,
    ]);
    assert.equal(runGuard(root).status, 1, body);
  }
});

test('authenticated runtime resolver inputs and literal dynamic dependencies cannot be waived', () => {
  const root = createTempRepo();
  writeFixture(
    root,
    'apps/web/src/legacy.ts',
    'import {db} from "@interdomestik/database";export function old(){return db.select();}'
  );
  sealFixture(root);
  writeFixture(
    root,
    'apps/web/src/app/page.ts',
    'import {old} from "src/legacy";export default function Page(){return old();}'
  );
  assert.equal(runGuard(root).status, 1);
  for (const file of ['apps/web/next.config.mjs', 'pnpm-workspace.yaml', '.pnpmfile.cjs']) {
    const candidate = createTempRepo();
    writeFixture(candidate, file, 'export default {};');
    assert.equal(runGuard(candidate).status, 1, file);
    assert.match(readReport(candidate).incomplete[0].reason, /resolver/u);
  }
  for (const manifest of [
    { name: '@interdomestik/web', imports: { '#legacy': './src/legacy.ts' } },
    { name: '@interdomestik/web', dependencies: { '@interdomestik/database': 'link:./fake' } },
  ]) {
    const candidate = createTempRepo();
    writeFixture(candidate, 'apps/web/package.json', JSON.stringify(manifest));
    assert.equal(runGuard(candidate).status, 1);
  }
  const dynamic = createTempRepo();
  writeFixture(dynamic, 'apps/web/src/admission.ts', 'export const admitted=true;');
  writeFixture(
    dynamic,
    'apps/web/src/old.ts',
    'import {db} from "@interdomestik/database";export async function old(){const {admitted}=await import("./admission");return db.select().where(admitted);}'
  );
  sealFixture(dynamic);
  writeFixture(dynamic, 'apps/web/src/admission.ts', 'export const admitted=false;');
  assert.equal(runGuard(dynamic).status, 1);
});

test('replacing or escaping the global process shape cannot use the default-env exemption', () => {
  for (const mutation of [
    '(globalThis as any).process=custom;',
    'const g=globalThis;g.process=custom;',
    'Object.assign(globalThis,{process:custom});',
  ]) {
    const root = createTempRepo();
    writeFixture(
      root,
      'apps/web/src/env.ts',
      'export function read(env=process.env){return env.X?.trim();}'
    );
    sealFixture(root);
    writeFixture(root, 'apps/web/src/app/page.ts', [
      'import {read} from "../env";',
      mutation,
      'export default function Page(){return read();}',
    ]);
    assert.equal(runGuard(root).status, 1, mutation);
  }
});

test('byte-frozen bootstrap follows imported module effects without inspecting trusted callback bodies', () => {
  const root = createTempRepo();
  writeFixture(root, 'packages/database/src/legacy-bootstrap.ts', [
    'import {db} from "./db";',
    'export const effect=db.select();',
  ]);
  writeFixture(root, 'packages/database/src/tenant.ts', [
    'import "./legacy-bootstrap";',
    'export async function withTenantContext(context:any, action:any){return action({});}',
    'export const withTenantDb=withTenantContext;',
  ]);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/app/page.ts', [
    'import {withTenantContext} from "@interdomestik/database";',
    'export default function Page(){return withTenantContext({},async tx=>tx.select());}',
  ]);
  assert.equal(runGuard(root).status, 1);
  assert.ok(readReport(root).failingNewEntries.some(entry => entry.mountedFrom));
});

test('unmaterialized trusted tsconfig inheritance fails incomplete', () => {
  const root = createTempRepo();
  writeFixture(
    root,
    'apps/web/tsconfig.json',
    JSON.stringify({ extends: '../../hidden-config.json' })
  );
  sealFixture(root);
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).incomplete[0].reason, /unmaterialized trusted tsconfig extends/);
});
