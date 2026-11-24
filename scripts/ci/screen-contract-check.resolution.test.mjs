// D-1 of the WP-05 flip (r1-B4, r2-B3, r3-B2/B3): a relative or `@/` request names the file
// TypeScript selects (`ts.resolveModuleName`, Bundler, the caller's options) and the file Next's
// webpack build selects, deduplicated; nothing else. `resolveFile` keeps TypeScript's pick.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { lint, tree, webTsconfig } from './fixtures/screen-contract-check/harness.mjs';
import {
  W,
  FROM,
  X,
  targetsIn,
  SCANNER_PR,
  both,
} from './fixtures/screen-contract-check/resolution-fixtures.mjs';
import { has, lacks } from './fixtures/screen-contract-check/rules-fixtures.mjs';
import { resolverFor } from './screen-contract/specifiers.mjs';
import { byCodeUnit } from './server-mutation/ast.mjs';

test('D-1: ./x with x.js and x.ts names both; resolveFile stays TypeScript’s x.ts', t => {
  const got = targetsIn(t, { [`${W}/components/x.js`]: X, [`${W}/components/x.ts`]: X }, './x');
  assert.deepEqual(got.targets, [`${W}/components/x.js`, `${W}/components/x.ts`]);
  assert.equal(got.file, `${W}/components/x.ts`);
});

test('D-1: @/x.js beside x.d.ts and x.js keeps the runtime x.js and its layer (CHK-15a)', async t => {
  const files = {
    [`${W}/lib/save.d.ts`]: 'export declare function save(): Promise<void>;\n',
    [`${W}/lib/save.js`]: "'use server';\nexport async function save() {}\n",
    'packages/domain-claims/src/edge.ts':
      "import { save } from '@/lib/save.js';\nexport const s = save;\n",
  };
  const got = targetsIn(t, files, '@/lib/save.js', 'packages/domain-claims/src/edge.ts');
  assert.deepEqual(got.targets, [`${W}/lib/save.d.ts`, `${W}/lib/save.js`]);
  has(
    await lint(tree(t, files)),
    'CHK-15a',
    'CHK-15a|packages/domain-claims/src/edge.ts|@/lib/save.js'
  );
});

test('D-1: ./x.mjs never names an unrelated x.ts', t => {
  const got = targetsIn(
    t,
    { [`${W}/components/x.ts`]: X, [`${W}/components/x.mts`]: X },
    './x.mjs'
  );
  assert.deepEqual(got.targets, [`${W}/components/x.mts`]);
});

test('D-1: ./x.cjs names x.cts; ./x.jsx with x.ts and x.tsx names TypeScript’s x.tsx only', t => {
  assert.deepEqual(targetsIn(t, { [`${W}/components/x.cts`]: X }, './x.cjs').targets, [
    `${W}/components/x.cts`,
  ]);
  const jsx = targetsIn(
    t,
    { [`${W}/components/x.ts`]: X, [`${W}/components/x.tsx`]: X },
    './x.jsx'
  );
  assert.deepEqual(jsx.targets, [`${W}/components/x.tsx`]);
  assert.equal(jsx.file, `${W}/components/x.tsx`);
});

// r3-B2: targets outside a fixed substitution list are still found, because the tool selects them.
test('D-1: ./x.jsx names a lone x.ts; ./x.js names a lone x.jsx', t => {
  assert.deepEqual(targetsIn(t, { [`${W}/components/x.ts`]: X }, './x.jsx').targets, [
    `${W}/components/x.ts`,
  ]);
  const files = {
    'apps/web/tsconfig.json': webTsconfig({ allowJs: true }),
    [`${W}/components/x.jsx`]: X,
  };
  assert.deepEqual(targetsIn(t, files, './x.js').targets, [`${W}/components/x.jsx`]);
  // Without allowJs TypeScript still selects the untyped x.jsx (its JavaScript pass); it is judged.
  assert.deepEqual(targetsIn(t, { [`${W}/components/x.jsx`]: X }, './x.js').targets, [
    `${W}/components/x.jsx`,
  ]);
});

// r3-B2: an unreachable sibling is not judged. Both tools select the file `x.ts` before the
// directory index, so a screen `x/index.ts` cannot refuse a valid action import.
test('D-1: a use-server x.ts beside a screen x/index.ts is the only target (CHK-15a)', async t => {
  const files = {
    [`${W}/features/x.ts`]: "'use server';\nexport async function act() {}\n",
    [`${W}/features/x/index.ts`]: 'export const Screen = () => null;\n',
    [`${W}/actions/do.ts`]:
      "'use server';\nimport { act } from '@/features/x';\nexport async function run() { await act(); }\n",
  };
  const got = targetsIn(t, files, '@/features/x', `${W}/actions/do.ts`);
  assert.deepEqual(got.targets, [`${W}/features/x.ts`]);
  lacks(await lint(tree(t, files)), 'CHK-15a', `CHK-15a|${W}/actions/do.ts|`);
  // The same import refused when the file is gone and the screen index is what loads.
  const screenOnly = { ...files };
  delete screenOnly[`${W}/features/x.ts`];
  has(await lint(tree(t, screenOnly)), 'CHK-15a', `CHK-15a|${W}/actions/do.ts|@/features/x`);
});

test('D-1: a file hides the directory index; a declaration file joins webpack’s index', t => {
  const hidden = targetsIn(
    t,
    { [`${W}/lib/auth.ts`]: X, [`${W}/lib/auth/index.ts`]: X },
    '@/lib/auth'
  );
  assert.deepEqual(hidden.targets, [`${W}/lib/auth.ts`]);
  const both = targetsIn(
    t,
    { [`${W}/lib/auth.d.ts`]: X, [`${W}/lib/auth/index.ts`]: X },
    '@/lib/auth'
  );
  assert.deepEqual(both.targets, [`${W}/lib/auth.d.ts`, `${W}/lib/auth/index.ts`]);
});

test('D-1: an exact asset is kept, including a cross-package stylesheet (CHK-15b)', async t => {
  const files = {
    'packages/ui/src/x.module.css': '.a {}\n',
    [`${W}/components/styled.tsx`]:
      "import s from '../../../../packages/ui/src/x.module.css';\nexport const S = () => s;\n",
  };
  const got = targetsIn(
    t,
    files,
    '../../../../packages/ui/src/x.module.css',
    `${W}/components/styled.tsx`
  );
  assert.deepEqual(got.targets, ['packages/ui/src/x.module.css']);
  has(
    await lint(tree(t, files)),
    'CHK-15b',
    `CHK-15b|${W}/components/styled.tsx|../../../../packages/ui/src/x.module.css`
  );
});

test('D-1: a request that reaches a directory with its own package.json is a scanner error', t => {
  const resolver = resolverFor(
    fs.realpathSync(
      tree(t, {
        [`${W}/lib/pkg/package.json`]: '{ "main": "main.js" }\n',
        [`${W}/lib/pkg/main.js`]: X,
      })
    )
  );
  assert.throws(
    () => resolver.resolveTargets(FROM, '@/lib/pkg'),
    both(/package\.json/u, SCANNER_PR)
  );
});

// r4-S1: Next's paths plugin passes over a substitution that ends in `.d.ts`; with the one fixed
// entry, webpack then has no pick and only TypeScript's is judged.
test('D-1: a @/* substitution ending in .d.ts is skipped by the webpack pick, as Next does', t => {
  const resolver = resolverFor(
    fs.realpathSync(tree(t, { [`${W}/types/save.d.ts`]: 'export declare const x: number;\n' }))
  );
  const spec = '@/types/save.d.ts';
  assert.deepEqual(
    resolver.resolveTargets(FROM, spec),
    resolver.resolveTargets(FROM, spec, 'type')
  );
});

// r4-S2b: Next installs one paths plugin, from the web app's tsconfig, for every module of the
// build; TypeScript compiles a package with the root config. Both fixed mappings name apps/web/src.
test('D-1: a package caller gets the same @/ file from both picks', t => {
  const got = targetsIn(t, { [`${W}/x.ts`]: X }, '@/x', 'packages/domain-claims/src/edge.ts');
  assert.deepEqual(got.targets, [`${W}/x.ts`]);
});

// r4-B2: a type-only import is erased; only TypeScript's pick is judged.
test('D-1: an import type edge names TypeScript’s pick only (CHK-15a)', async t => {
  const files = {
    [`${W}/components/item.d.ts`]: 'export type T = number;\n',
    [`${W}/components/item.js`]: 'export const item = 1;\n',
    [`${W}/actions/do.ts`]:
      "'use server';\nimport type { T } from '@/components/item';\nexport async function run(t: T) { return t; }\n",
  };
  const resolver = resolverFor(fs.realpathSync(tree(t, files)));
  const from = `${W}/actions/do.ts`;
  assert.deepEqual(resolver.resolveTargets(from, '@/components/item', 'type'), [
    `${W}/components/item.d.ts`,
  ]);
  assert.deepEqual(
    [...resolver.resolveTargets(from, '@/components/item', 'import')].sort(byCodeUnit),
    [`${W}/components/item.d.ts`, `${W}/components/item.js`]
  );
  lacks(await lint(tree(t, files)), 'CHK-15a', `CHK-15a|${from}|`);
  const valueImport = {
    ...files,
    [`${W}/actions/do.ts`]:
      "'use server';\nimport { item } from '@/components/item';\nexport async function run() { return item; }\n",
  };
  has(await lint(tree(t, valueImport)), 'CHK-15a', `CHK-15a|${from}|@/components/item`);
});

// r6: webpack tries `index` itself before `index.<ext>`, so an extensionless index file is a pick.
test('D-1: ./widget names an extensionless widget/index, as webpack resolves it', t => {
  const got = targetsIn(t, { [`${W}/components/widget/index`]: X }, './widget');
  assert.deepEqual(got.targets, [`${W}/components/widget/index`]);
  const named = targetsIn(
    t,
    { [`${W}/components/widget/index`]: X, [`${W}/components/widget/index.ts`]: X },
    './widget'
  );
  assert.ok(named.targets.includes(`${W}/components/widget/index.ts`), named.targets.join());
});
