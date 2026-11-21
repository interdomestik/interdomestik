import assert from 'node:assert/strict';
import test from 'node:test';

import { lint, tree } from './fixtures/screen-contract-check/harness.mjs';
import { W } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { has, lacks } from './fixtures/screen-contract-check/rules-fixtures.mjs';

test('CHK-15a: an upward edge is a finding wherever the source lives (B1, B15, H4, H7)', async t => {
  const root = tree(t, {
    [`${W}/components/view.tsx`]: 'export const View = () => null;\n',
    [`${W}/actions/a.ts`]:
      "'use server';\nimport { View } from '../components/view';\nexport async function a() { return View; }\n",
    [`${W}/features/f/actions.ts`]:
      "'use server';\nimport { View } from '@/components/view';\nexport async function f() { return View; }\n",
    [`${W}/features/g/actions.ts`]:
      "'use strict';\n'use server';\nimport { View } from '@/components/view';\nexport async function g() { return View; }\n",
    [`${W}/lib/save.ts`]:
      "'use server';\nimport { View } from '@/components/view';\nexport async function save() { return View; }\n",
    [`${W}/app/api/x/route.ts`]:
      "import { f } from '@/features/f/actions';\nexport const GET = f;\n",
    'packages/domain-claims/src/up.ts':
      "import { a } from '../../../apps/web/src/actions/a';\nexport const up = a;\n",
    'packages/database/src/up.ts':
      "import { claims } from '@interdomestik/domain-claims';\nexport const x = claims;\n",
  });
  const result = await lint(root);
  has(result, 'CHK-15a', `CHK-15a|${W}/actions/a.ts|../components/view`);
  has(result, 'CHK-15a', `CHK-15a|${W}/features/f/actions.ts|@/components/view`);
  has(result, 'CHK-15a', `CHK-15a|${W}/features/g/actions.ts|@/components/view`);
  has(result, 'CHK-15a', `CHK-15a|${W}/lib/save.ts|@/components/view`);
  has(
    result,
    'CHK-15a',
    'CHK-15a|packages/domain-claims/src/up.ts|../../../apps/web/src/actions/a'
  );
  has(result, 'CHK-15a', 'CHK-15a|packages/database/src/up.ts|@interdomestik/domain-claims');
  lacks(result, 'CHK-15a', `CHK-15a|${W}/app/api/`);
  for (const layer of ['2', '3', '4'])
    assert.ok(result['CHK-15a'].units[`source:${layer}`] > 0, layer);
});

test('CHK-15b: workspace imports through exports only; relative paths never reach into a package', async t => {
  const file = `${W}/components/c.tsx`;
  const root = tree(t, {
    [file]: [
      "import { Avatar } from '@interdomestik/ui/components/avatar';",
      "import { Button } from '@interdomestik/ui/button';",
      "import { Star } from '@interdomestik/ui/icons/star';",
      "import { Nope } from '@interdomestik/nope';",
      "import { Avatar as A2 } from '../../../../packages/ui/src/components/avatar';",
      'export const C = [Avatar, Button, Star, Nope, A2];',
    ].join('\n'),
    'packages/ui/src/self.ts': "export * from '@interdomestik/ui/components/avatar';\n",
  });
  const result = await lint(root);
  has(result, 'CHK-15b', `CHK-15b|${file}|@interdomestik/ui/components/avatar`);
  has(result, 'CHK-15b', `CHK-15b|${file}|@interdomestik/nope`);
  has(result, 'CHK-15b', `CHK-15b|${file}|../../../../packages/ui/src/components/avatar`);
  lacks(result, 'CHK-15b', `CHK-15b|${file}|@interdomestik/ui/button`);
  lacks(result, 'CHK-15b', `CHK-15b|${file}|@interdomestik/ui/icons/star`);
  lacks(result, 'CHK-15b', 'CHK-15b|packages/ui/src/self.ts');
});

const pkgJson = (name, exportsMap) => JSON.stringify({ name, private: true, exports: exportsMap });

test('CHK-15a: a value edge resolves under the value conditions, a type edge under types (B5)', async t => {
  const root = tree(t, {
    'apps/web/src/app/home/page.tsx': 'export default () => null;\n',
    // `types` names a declaration (no layer) and the value conditions name the source.
    'packages/domain-decl/package.json': pkgJson('@interdomestik/domain-decl', {
      '.': { types: './src/index.d.ts', import: './src/index.ts', default: './src/index.ts' },
    }),
    'packages/domain-decl/src/index.ts': 'export const decl = 1;\n',
    'packages/domain-decl/src/index.d.ts': 'export declare const decl: number;\n',
    'packages/database/src/up-decl.ts':
      "import { decl } from '@interdomestik/domain-decl';\nexport const x = decl;\n",
    // `types` names a layer-3 file and the value conditions a layer-2 ('use server') file.
    'packages/domain-split/package.json': pkgJson('@interdomestik/domain-split', {
      '.': { types: './src/api.ts', default: './src/impl.ts' },
    }),
    'packages/domain-split/src/api.ts': 'export type Api = { a: number };\n',
    'packages/domain-split/src/impl.ts': "'use server';\nexport async function impl() {}\n",
    'packages/domain-claims/src/value.ts':
      "import { impl } from '@interdomestik/domain-split';\nexport const v = impl;\n",
    'packages/domain-claims/src/typed.ts':
      "import type { Api } from '@interdomestik/domain-split';\nexport type T = Api;\n",
  });
  const result = await lint(root);
  has(result, 'CHK-15a', 'CHK-15a|packages/database/src/up-decl.ts|@interdomestik/domain-decl');
  has(result, 'CHK-15a', 'CHK-15a|packages/domain-claims/src/value.ts|@interdomestik/domain-split');
  lacks(result, 'CHK-15a', 'CHK-15a|packages/domain-claims/src/typed.ts');
});

test('CHK-15a: a package caller resolves @/ through the root tsconfig, a web caller through the web one (H7)', async t => {
  const root = tree(t, {
    'tsconfig.json':
      '{\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["apps/web/src/*"] } }\n}\n',
    'apps/web/tsconfig.json':
      '{\n  // web\n  "compilerOptions": { "paths": { "@/*": ["./src/components/*"] } },\n}\n',
    [`${W}/actions/a.ts`]: "'use server';\nexport async function a() {}\n",
    [`${W}/components/view.tsx`]: 'export const View = () => null;\n',
    // Root mapping: apps/web/src/actions/a (layer 2). The web mapping would name a missing file.
    'packages/domain-claims/src/h7.ts': "import { a } from '@/actions/a';\nexport const h = a;\n",
    // Web mapping: apps/web/src/components/view (layer 1). The root mapping would name a missing file.
    [`${W}/actions/b.ts`]:
      "'use server';\nimport { View } from '@/view';\nexport async function b() { return View; }\n",
  });
  const result = await lint(root);
  has(result, 'CHK-15a', 'CHK-15a|packages/domain-claims/src/h7.ts|@/actions/a');
  has(result, 'CHK-15a', `CHK-15a|${W}/actions/b.ts|@/view`);
});

test('CHK-15a: the root tsconfig and its @/* mapping are required inputs (§5)', async t => {
  await assert.rejects(lint(tree(t, { 'tsconfig.json': null })), /tsconfig\.json is missing/u);
  await assert.rejects(lint(tree(t, { 'tsconfig.json': '' })), /tsconfig\.json is empty/u);
  await assert.rejects(
    lint(tree(t, { 'tsconfig.json': '{ "compilerOptions": { "paths": {} } }' })),
    /tsconfig\.json has no @\/\* mapping/u
  );
});

test('CHK-15b: an exports array whose first target is absent refuses a value edge (B4)', async t => {
  const file = `${W}/components/arr.tsx`;
  const root = tree(t, {
    'packages/shared-arr/package.json': pkgJson('@interdomestik/shared-arr', {
      './x': ['./src/missing.ts', './src/x.ts'],
    }),
    'packages/shared-arr/src/x.ts': 'export const X = 1;\nexport type XT = number;\n',
    [file]: ["import { X } from '@interdomestik/shared-arr/x';", 'export const C = X;'].join('\n'),
    [`${W}/components/arr-type.tsx`]:
      "import type { XT } from '@interdomestik/shared-arr/x';\nexport type C = XT;\n",
  });
  const result = await lint(root);
  has(result, 'CHK-15b', `CHK-15b|${file}|@interdomestik/shared-arr/x`);
  lacks(result, 'CHK-15b', `CHK-15b|${W}/components/arr-type.tsx`);
});

test('CHK-15b: an invalid string inside an exports array is an input error (B4, §5)', async t => {
  const root = tree(t, {
    'packages/shared-bad/package.json': pkgJson('@interdomestik/shared-bad', {
      '.': ['src/index.ts', './src/index.ts'],
    }),
    'packages/shared-bad/src/index.ts': 'export const B = 1;\n',
  });
  await assert.rejects(lint(root), /shared-bad.*does not start with "\.\/"/u);
});

test('CHK-15b, CHK-15c: type-only export-from and import types are type edges (H1)', async t => {
  const file = `${W}/components/types.tsx`;
  const root = tree(t, {
    'packages/shared-t/package.json': pkgJson('@interdomestik/shared-t', {
      './t': { types: './src/t.ts' },
    }),
    'packages/shared-t/src/t.ts': 'export type T = number;\nexport const V = 1;\n',
    [file]: [
      "export { type T } from '@interdomestik/shared-t/t';",
      "type Db = import('@interdomestik/database').Db;",
      'export const C = (d: Db) => d;',
    ].join('\n'),
    [`${W}/components/mixed.tsx`]: "export { type T, V } from '@interdomestik/shared-t/t';\n",
  });
  const result = await lint(root);
  lacks(result, 'CHK-15b', `CHK-15b|${file}|`);
  has(result, 'CHK-15b', `CHK-15b|${W}/components/mixed.tsx|@interdomestik/shared-t/t`);
  has(result, 'CHK-15c', `CHK-15c|${file}|@interdomestik/database`);
  assert.ok(result['CHK-15c'].units['edge:type'] >= 2);
});

test('CHK-15a: every @/* mapping is tried in order, the first existing file wins (B8)', async t => {
  const root = tree(t, {
    // The first root mapping names a support directory, the second the web sources.
    'tsconfig.json':
      '{\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["apps/web/src/lib/*", "apps/web/src/*"] } }\n}\n',
    'apps/web/tsconfig.json':
      '{\n  "compilerOptions": { "paths": { "@/*": ["./src/lib/*", "./src/*"] } },\n}\n',
    [`${W}/actions/only.ts`]: "'use server';\nexport async function only() {}\n",
    [`${W}/actions/both.ts`]: "'use server';\nexport async function both() {}\n",
    [`${W}/lib/actions/both.ts`]: 'export async function both() {}\n',
    [`${W}/components/view.tsx`]: 'export const View = () => null;\n',
    // Only the second mapping names a file: layer 2 under a domain source.
    'packages/domain-claims/src/second.ts':
      "import { only } from '@/actions/only';\nexport const s = only;\n",
    // The first mapping's file (support, no layer) wins over the second's (layer 2).
    'packages/domain-claims/src/first.ts':
      "import { both } from '@/actions/both';\nexport const f = both;\n",
    // A web caller follows the second web mapping to a layer-1 file.
    [`${W}/actions/web.ts`]:
      "'use server';\nimport { View } from '@/components/view';\nexport async function w() { return View; }\n",
  });
  const result = await lint(root);
  has(result, 'CHK-15a', 'CHK-15a|packages/domain-claims/src/second.ts|@/actions/only');
  lacks(result, 'CHK-15a', 'CHK-15a|packages/domain-claims/src/first.ts');
  has(result, 'CHK-15a', `CHK-15a|${W}/actions/web.ts|@/components/view`);
});

test('CHK-15a: an @/* mapping that is empty, or has an entry that is not a string or has two *, is an input error (§5)', async t => {
  const mappings = ['[]', '["apps/web/src/*", 3]', '["apps/web/src/*/*"]'];
  await Promise.all(
    mappings.map(mapping => {
      const config = `{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ${mapping} } } }`;
      return assert.rejects(
        lint(tree(t, { 'tsconfig.json': config })),
        /tsconfig\.json has no usable @\/\* mapping/u,
        mapping
      );
    })
  );
});
