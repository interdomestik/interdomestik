import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  writeFixture,
  sealFixture,
  runGuard,
  readReport,
} from './db-access-guard-test-utils.mjs';
const PAGE = 'apps/web/src/app/page.ts';
const CONTEXT = 'import {withTenantContext} from "@interdomestik/database";';
test('authenticated schema chain precision never grants changed bytes or arbitrary methods/callbacks', () => {
  for (const suffix of ['primaryKey()', 'futureOperation()', 'references(()=>db.select())']) {
    const root = createTempRepo();
    writeFixture(
      root,
      'packages/database/package.json',
      JSON.stringify({ name: '@interdomestik/database', dependencies: { 'drizzle-orm': '1' } })
    );
    const file = 'packages/database/src/schema/stable.ts';
    writeFixture(root, file, [
      'import {text} from "drizzle-orm/pg-core";',
      'import {db} from "../db";',
      `export const id=text("id").${suffix};`,
    ]);
    sealFixture(root);
    writeFixture(
      root,
      PAGE,
      'import "../../../../packages/database/src/schema/stable";export default function Page(){return "safe";}'
    );
    const result = runGuard(root);
    const report = readReport(root);
    assert.equal(result.status, suffix === 'primaryKey()' ? 0 : 1, JSON.stringify(report));
    if (suffix === 'primaryKey()') {
      writeFixture(
        root,
        file,
        'import {text} from "drizzle-orm/pg-core";export const id=text("id").primaryKey();'
      );
      assert.equal(runGuard(root).status, 1, JSON.stringify(readReport(root)));
    }
  }
});

test('schema column precision preserves explicit and new opaque mutation through aliases and parameters', () => {
  for (const mutation of [
    '',
    'table.id=tx;',
    'touch(table);',
    'const alias=table;touch(alias);',
    'pass(table);',
    'eq.call.call(touch,null,table);',
    'tx.select().from.call.call(touch,null,table);',
    'tx.query.constructor.assign(table,{id:tx});',
  ]) {
    const root = createTempRepo();
    writeFixture(
      root,
      'packages/database/package.json',
      JSON.stringify({
        name: '@interdomestik/database',
        dependencies: { 'drizzle-orm': '1', 'external-library': '1' },
      })
    );
    writeFixture(
      root,
      'packages/database/src/schema/stable.ts',
      'import {pgTable,text} from "drizzle-orm/pg-core";import {touch} from "external-library";export const table=pgTable("x",{id:text("id")});export function historical(){touch(table);}export function getColumn(){return table.id;}'
    );
    writeFixture(
      root,
      'apps/web/src/legacy.ts',
      'import {table} from "../../../packages/database/src/schema/stable";import {touch} from "external-library";export function historical(){touch(table);}export function pass(t){touch(t);}'
    );
    sealFixture(root);
    writeFixture(root, PAGE, [
      CONTEXT,
      'import {table,getColumn} from "../../../../packages/database/src/schema/stable";import {pass} from "../legacy";import {touch} from "external-library";import {eq} from "drizzle-orm";',
      `export function read(){return withTenantContext({},async tx=>{${mutation}return getColumn();});}`,
    ]);
    const execution = runGuard(root),
      report = readReport(root);
    assert.equal(execution.status, mutation ? 1 : 0, `${mutation}\n${JSON.stringify(report)}`);
    if (mutation)
      assert.ok(
        report.incomplete.some(item => /handle analysis bound/.test(item.reason)),
        JSON.stringify(report)
      );
  }
});

test('only authenticated Drizzle sql data ignores historical opaque taint; new writes still reject', () => {
  for (const mutation of [
    '',
    'clause.value=tx;',
    'touch(clause);',
    'const alias=clause;touch(alias);',
    'pass(clause);',
    'external-tag',
  ]) {
    const root = createTempRepo();
    writeFixture(
      root,
      'packages/database/package.json',
      JSON.stringify({
        name: '@interdomestik/database',
        dependencies: { 'drizzle-orm': '1', 'external-library': '1' },
      })
    );
    const tag = mutation === 'external-tag' ? 'tag' : 'sql';
    writeFixture(
      root,
      'packages/database/src/schema/stable.ts',
      `import {sql} from "drizzle-orm";import {tag,touch} from "external-library";export function historical(){touch(clause);}export const clause=sql\`true\`;export function build(){return ${tag}\`\${clause}\`;}`
    );
    writeFixture(
      root,
      'apps/web/src/legacy.ts',
      'import {clause} from "../../../packages/database/src/schema/stable";import {touch} from "external-library";export function historical(){touch(clause);}export function pass(value){touch(value);}'
    );
    sealFixture(root);
    writeFixture(root, PAGE, [
      CONTEXT,
      'import {clause,build} from "../../../../packages/database/src/schema/stable";import {pass} from "../legacy";import {touch} from "external-library";',
      `export function read(){return withTenantContext({},async tx=>{${mutation === 'external-tag' ? '' : mutation}return build();});}`,
    ]);
    const result = runGuard(root),
      report = readReport(root);
    assert.equal(result.status, mutation ? 1 : 0, `${mutation}\n${JSON.stringify(report)}`);
    if (mutation)
      assert.ok(
        report.incomplete.some(item => /handle argument/.test(item.reason)),
        JSON.stringify(report)
      );
  }
});

test('SQL precision preserves true handle rejection and embedded callback remount inspection', () => {
  const root = createTempRepo();
  writeFixture(root, PAGE, [
    CONTEXT,
    'import {sql} from "drizzle-orm";export function read(){return withTenantContext({},async tx=>sql`${tx}`);}',
  ]);
  assert.equal(runGuard(root).status, 1);
  assert.ok(
    readReport(root).incomplete.some(item => /tenant transaction handle passed/.test(item.reason))
  );
  for (const argument of ['()=>db.select()', '{run:()=>db.select()}']) {
    const legacy = createTempRepo();
    writeFixture(
      legacy,
      'apps/web/src/legacy.ts',
      `import {db} from "@interdomestik/database";import {sql} from "drizzle-orm";export function old(){return sql\`\${${argument}}\`;}`
    );
    sealFixture(legacy);
    writeFixture(
      legacy,
      PAGE,
      'import {old} from "../legacy";export default function Page(){return old();}'
    );
    assert.equal(runGuard(legacy).status, 1, argument);
    assert.ok(
      readReport(legacy).failingNewEntries.some(item => item.mountedFrom),
      JSON.stringify(readReport(legacy))
    );
  }
});
