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

const legacy = [
  'import { db } from "@interdomestik/database";',
  'export function unsafe(){return db.selectDistinctOn([user.id]).from(user);}',
  'export function safe(){return "safe";}',
];

test('DISTINCT ON remains inventoried with ambient failure and canonical tenant approval', () => {
  for (const [imported, invocation, expected] of [
    ['db', 'db.selectDistinctOn([user.id]).from(user)', 1],
    [
      'withTenantContext as scoped',
      'scoped(t, async tx=>tx.selectDistinctOn([user.id]).from(user))',
      0,
    ],
  ]) {
    const { result, report } = scan([
      `import { ${imported} } from "@interdomestik/database";`,
      `export function read(t){return ${invocation};}`,
    ]);
    assert.equal(result.status, expected, result.stderr);
    assert.equal(report.newEntries[0].method, 'selectDistinctOn');
  }
});

test('symbol-specific mixed barrel allows safe export but rejects relative, alias and export-star remount', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/legacy.ts', legacy);
  writeFixture(root, 'apps/web/src/barrel.ts', 'export * from "./legacy";');
  sealFixture(root);
  writeFixture(root, 'apps/web/src/app/page.tsx', [
    'import { safe } from "../barrel";',
    'export default function Page(){return safe();}',
  ]);
  assert.equal(runGuard(root).status, 0);
  for (const module of ['../barrel', '@/barrel', '@/legacy']) {
    writeFixture(root, 'apps/web/src/app/page.tsx', [
      `import { unsafe as read } from "${module}";`,
      'export default function Page(){return read();}',
    ]);
    assert.equal(runGuard(root).status, 1, module);
  }
});

test('workspace exports and subpaths preserve exact symbol selection', () => {
  const root = createTempRepo();
  writeFixture(
    root,
    'packages/domain-example/package.json',
    JSON.stringify({
      name: '@interdomestik/domain-example',
      exports: { '.': './src/index.ts', './leaf': './src/legacy.ts' },
    })
  );
  writeFixture(root, 'packages/domain-example/src/legacy.ts', legacy);
  writeFixture(
    root,
    'packages/domain-example/src/index.ts',
    'export {unsafe as default, safe} from "./legacy";'
  );
  sealFixture(root);
  for (const line of [
    'import read from "@interdomestik/domain-example";',
    'import {unsafe as read} from "@interdomestik/domain-example/leaf";',
  ]) {
    writeFixture(root, 'apps/web/src/app/route.ts', [
      line,
      'export function GET(){return read();}',
    ]);
    assert.equal(runGuard(root).status, 1, line);
  }
});

test('same existing edge with changed arguments, props or caller controls reaches old ambient debt', () => {
  for (const revised of [
    'export default function Page(){return unsafe("foreign");}',
    'export default function Page(){return <Unsafe owner="foreign"/>;}',
    'export default function Page(){if(false)throw Error("denied");return unsafe("owner");}',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/legacy.ts', legacy);
    const imports = 'import {unsafe, unsafe as Unsafe} from "../legacy";';
    writeFixture(root, 'apps/web/src/app/page.tsx', [
      imports,
      'export default function Page(){if(!admitted)throw Error("denied");return unsafe("owner");}',
    ]);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/app/page.tsx', [imports, revised]);
    assert.equal(runGuard(root).status, 1, revised);
  }
});

test('literal dynamic imports resolve exports; computed imports fail incomplete', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/legacy.ts', legacy);
  sealFixture(root);
  for (const body of [
    'const module = await import("../legacy"); return module.unsafe();',
    'const {unsafe}=await import("../legacy"); return unsafe();',
  ]) {
    writeFixture(
      root,
      'apps/web/src/app/page.tsx',
      `export default async function Page(){${body}}`
    );
    assert.equal(runGuard(root).status, 1, body);
  }
  writeFixture(
    root,
    'apps/web/src/app/page.tsx',
    'export default async function Page(){return import(path);}'
  );
  assert.equal(runGuard(root).status, 1);
  assert.equal(readReport(root).status, 'incomplete');
});

test('computed, unresolved and recursive executable edges fail closed', () => {
  for (const lines of [
    ['import {unsafe} from "../missing";', 'export default function Page(){return unsafe();}'],
    ['import * as x from "../legacy";', 'export default function Page(){return x[name]();}'],
    ['function recurse(){return recurse();}', 'export default function Page(){return recurse();}'],
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/legacy.ts', legacy);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/app/page.tsx', lines);
    assert.equal(runGuard(root).status, 1);
    assert.equal(readReport(root).status, 'incomplete');
  }
});

test('new excluded-suffix/API/internal catalog paths cannot conceal ambient operations or remounts', () => {
  for (const file of [
    'apps/web/src/hidden.test.ts',
    'apps/web/src/app/api/e2e/hidden.ts',
    'packages/database/src/seed-hidden.ts',
  ]) {
    const { result } = scan(legacy, file);
    assert.equal(result.status, 1, file);
  }
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/hidden.test.ts', legacy);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/app/page.tsx', [
    'import {unsafe} from "../hidden.test";',
    'export default function Page(){return unsafe();}',
  ]);
  assert.equal(runGuard(root).status, 1);
});

test('candidate package exports cannot remap canonical context authority', () => {
  const root = createTempRepo();
  writeFixture(
    root,
    'apps/web/src/fake.ts',
    'export function withTenantContext(c,fn){return fn(db);}'
  );
  writeFixture(
    root,
    'packages/database/package.json',
    JSON.stringify({
      name: '@interdomestik/database',
      exports: { '.': '../../apps/web/src/fake.ts' },
    })
  );
  writeFixture(root, 'apps/web/src/app/page.tsx', [
    'import {withTenantContext} from "@interdomestik/database";',
    'export default function Page(t){return withTenantContext(t,async tx=>tx.select());}',
  ]);
  // Root resolver is fixed; the changed fake operation remains unapproved.
  assert.equal(runGuard(root).status, 1);
});

test('layout and use-server action remounts cannot activate ambient historical leaves', () => {
  for (const [file, body] of [
    ['apps/web/src/app/layout.tsx', 'export default function Layout(){return unsafe();}'],
    [
      'apps/web/src/actions/case.ts',
      '"use server"; export async function action(){return unsafe();}',
    ],
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/legacy.ts', legacy);
    sealFixture(root);
    writeFixture(root, file, ['import {unsafe} from "@/legacy";', body]);
    assert.equal(runGuard(root).status, 1);
  }
});

test('graph depth at supported48 passes;49 is incomplete rather than debt or safe', () => {
  for (const depth of [48, 49]) {
    const root = createTempRepo();
    const declarations = Array.from(
      { length: depth },
      (_, index) =>
        `export function f${index}(){return ${index === depth - 1 ? '"done"' : `f${index + 1}()`};}`
    );
    writeFixture(root, 'apps/web/src/chain.ts', declarations);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/app/page.tsx', [
      'import {f0} from "../chain";',
      'export default function Page(){return f0();}',
    ]);
    const result = runGuard(root);
    assert.equal(result.status, depth === 48 ? 0 : 1, result.stderr);
    if (depth === 49) assert.match(readReport(root).incomplete[0].reason, /graph bound/u);
  }
});

test('changed parse errors fail incomplete; split-chain predicate weakening invalidates debt', () => {
  const parse = scan('export function broken( {');
  assert.equal(parse.result.status, 1);
  assert.equal(parse.report.status, 'incomplete');
  const root = createTempRepo();
  const original = [
    'import {db} from "@interdomestik/database";',
    'export function read(owner){const query=db.select().from(user);return query.where(eq(user.owner,owner));}',
  ];
  writeFixture(root, 'apps/web/src/split.ts', original);
  sealFixture(root);
  writeFixture(
    root,
    'apps/web/src/split.ts',
    original.join('\n').replace('eq(user.owner,owner)', 'true')
  );
  assert.equal(runGuard(root).status, 1);
});

test('static and dynamic module initialization remounts old top-level ambient effects', () => {
  for (const body of [
    ['import "../effects";', 'export default function Page(){return "page";}'],
    ['import {safe} from "../effects";', 'export default function Page(){return safe();}'],
    ['export default async function Page(){return import("../effects");}'],
    ['export {safe} from "../effects";'],
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/effects.ts', [
      'import {db} from "@interdomestik/database";',
      'const loaded = db.select().from(user);',
      'export function safe(){return "safe";}',
    ]);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/app/page.tsx', body);
    assert.equal(runGuard(root).status, 1, body.join('\n'));
    assert.ok(readReport(root).failingNewEntries.some(entry => entry.file.endsWith('effects.ts')));
  }
});

test('module initialization does not execute uncalled exported bodies; unresolved side-effects fail incomplete', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/legacy.ts', legacy);
  sealFixture(root);
  writeFixture(root, 'apps/web/src/app/page.tsx', [
    'import {safe} from "../legacy";',
    'export default function Page(){return safe();}',
  ]);
  assert.equal(runGuard(root).status, 0);
  writeFixture(
    root,
    'apps/web/src/app/page.tsx',
    'import "../missing-effects"; export default function Page(){return "ok";}'
  );
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).incomplete[0].reason, /module initialization/u);
});
