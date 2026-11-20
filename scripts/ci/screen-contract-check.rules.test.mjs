import assert from 'node:assert/strict';
import test from 'node:test';

import { ids, lint, tree } from './fixtures/screen-contract-check/harness.mjs';

const W = 'apps/web/src';
const has = (result, check, key) =>
  assert.ok(
    ids(result, check).includes(key),
    `${check} lacks ${key}: ${JSON.stringify(ids(result, check))}`
  );
const lacks = (result, check, prefix) =>
  assert.deepEqual(
    ids(result, check).filter(id => id.startsWith(prefix)),
    [],
    `${check} ${prefix}`
  );

test('CHK-15c: a screen importing the database, in every edge kind, is a finding', async t => {
  const page = `${W}/app/x/page.tsx`;
  const root = tree(t, {
    [page]: [
      "import { db } from '@interdomestik/database';",
      "import type { things } from '@interdomestik/database/schema';",
      "export { db as d2 } from '@interdomestik/database';",
      "import { eq } from 'drizzle-orm';",
      "import postgres from 'postgres';",
      "const pg = require('pg');",
      "const lazy = () => import('drizzle-orm/pg-core');",
      "import { db as rel } from '../../../../../packages/database/src';",
      'export default function Page() { return null; }',
    ].join('\n'),
    [`${W}/app/y/page.jsx`]:
      "import { db } from '@interdomestik/database';\nexport default () => null;\n",
    [`${W}/features/s/save.ts`]:
      "'use server';\nimport { db } from '@interdomestik/database';\nexport async function s() {}\n",
    [`${W}/app/feed/route.ts`]:
      "import { db } from '@interdomestik/database';\nexport const GET = () => db;\n",
    [`${W}/lib/db.ts`]: "export { db } from '@interdomestik/database';\n",
  });
  const result = await lint(root);
  for (const spec of [
    '@interdomestik/database',
    '@interdomestik/database/schema',
    'drizzle-orm',
    'postgres',
    'pg',
    'drizzle-orm/pg-core',
    '../../../../../packages/database/src',
  ])
    has(result, 'CHK-15c', `CHK-15c|${page}|${spec}`);
  has(result, 'CHK-15c', `CHK-15c|${W}/app/y/page.jsx|@interdomestik/database`);
  // A 'use server' file under a screen path is a screen (B2).
  has(result, 'CHK-15c', `CHK-15c|${W}/features/s/save.ts|@interdomestik/database`);
  // A route handler outside api/ is a handler; support is not a screen.
  lacks(result, 'CHK-15c', `CHK-15c|${W}/app/feed/`);
  lacks(result, 'CHK-15c', `CHK-15c|${W}/lib/`);
  // The duplicate export-from edge counts twice (multiset).
  assert.equal(
    ids(result, 'CHK-15c').filter(id => id === `CHK-15c|${page}|@interdomestik/database`).length,
    2
  );
  assert.ok(result['CHK-15c'].units['edge:import'] >= 4);
});

test('CHK-15c: inline directives cannot turn the rule off (B8)', async t => {
  const root = tree(t, {
    [`${W}/app/x/page.tsx`]:
      "/* eslint-disable */\n// eslint-disable-next-line\nimport { db } from '@interdomestik/database';\nexport default () => db;\n",
  });
  has(await lint(root), 'CHK-15c', `CHK-15c|${W}/app/x/page.tsx|@interdomestik/database`);
});

test('CHK-09: calls, not imports, and toFixed only in a display position (B7, B13, B19)', async t => {
  const file = `${W}/components/f.tsx`;
  const root = tree(t, {
    [file]: [
      "import { format, formatISO, format as fmt } from 'date-fns';",
      "import * as dateFns from 'date-fns';",
      "import lightFormat from 'date-fns/lightFormat';",
      "import { useFormatter, useTranslations } from 'next-intl';",
      'export function F({ n, d, rate, cache, setX, cond }) {',
      '  const format2 = useFormatter();',
      "  const tr = useTranslations('x');",
      '  const { relativeTime } = useFormatter();',
      '  cache.get("rate/" + rate.toFixed(2));',
      '  const payload = { amount: n.toFixed(2) };',
      '  setX(n.toFixed(1));',
      '  Number(n.toFixed(2));',
      '  const iso = formatISO(d) + d.toISOString();',
      "  new Intl.ListFormat('en');",
      '  format(d, "P"); fmt(d, "P"); dateFns.format(d, "P"); lightFormat(d, "P");',
      '  relativeTime(d);',
      "  format2.number(n, { style: 'currency', currency: 'EUR' });",
      '  format2.list(["a"]);',
      "  const a = new Intl.DateTimeFormat('en'); const b = globalThis.Intl.NumberFormat('en');",
      '  return (<div title={`${n.toFixed(2)} EUR`}>',
      '    {d.toLocaleDateString()}',
      '    <span>{"€ " + n.toFixed(2)}</span>',
      "    {cond ? n.toFixed(1) : '-'}",
      '    {`${n.toPrecision(3)}`}',
      "    {tr('x', { v: n.toFixed(2) })}",
      '  </div>);',
      '}',
    ].join('\n'),
  });
  const result = await lint(root);
  const count = callee =>
    ids(result, 'CHK-09').filter(id => id === `CHK-09|${file}|${callee}`).length;
  assert.equal(count('toLocaleDateString'), 1);
  assert.equal(count('toFixed'), 4, 'title, JSX child concat, conditional child, t() value');
  assert.equal(count('toPrecision'), 1);
  assert.equal(count('date-fns.format'), 3, 'named, aliased, namespace');
  assert.equal(count('date-fns.lightFormat'), 1);
  assert.equal(count('next-intl.relativeTime'), 1);
  assert.equal(count('next-intl.number'), 1);
  assert.equal(count('Intl.DateTimeFormat'), 1);
  assert.equal(count('Intl.NumberFormat'), 1);
  lacks(result, 'CHK-09', `CHK-09|${file}|date-fns.formatISO`);
  lacks(result, 'CHK-09', `CHK-09|${file}|Intl.ListFormat`);
  lacks(result, 'CHK-09', `CHK-09|${file}|next-intl.list`);
  assert.equal(ids(result, 'CHK-09').length, 14);
});

test('CHK-09: a literal require of date-fns is followed', async t => {
  const file = `${W}/components/r.js`;
  const root = tree(t, {
    [file]:
      "const { format } = require('date-fns');\nconst df = require('date-fns');\nexport const a = d => format(d, 'P') + df.intlFormat(d);\n",
  });
  const result = await lint(root);
  has(result, 'CHK-09', `CHK-09|${file}|date-fns.format`);
  has(result, 'CHK-09', `CHK-09|${file}|date-fns.intlFormat`);
});

test('A11Y: jsx-a11y recommended and labelled-control, with the tested scope (H6, O2)', async t => {
  const file = `${W}/components/form.tsx`;
  const root = tree(t, {
    [file]: [
      "import { Input, Label, Checkbox } from '@interdomestik/ui';",
      'export function F({ field, FancyField }) {',
      '  return (<form>',
      '    <img src="x.png" />',
      '    <input />',
      '    <Input />',
      '    <Checkbox />',
      '    <Label htmlFor="ok">Ok</Label><Input id="ok" />',
      '    <Input aria-label="named" />',
      '    <label>Wrapped <input /></label>',
      '    <Input {...field} />',
      '    <input type="hidden" name="h" />',
      '    <FancyField />',
      '  </form>);',
      '}',
    ].join('\n'),
  });
  const result = await lint(root);
  const rule = 'screen-contract/labelled-control';
  const found = ids(result, 'A11Y');
  assert.equal(found.filter(id => id === `A11Y|${file}|${rule}|input`).length, 1);
  assert.equal(found.filter(id => id === `A11Y|${file}|${rule}|Input`).length, 1);
  assert.equal(found.filter(id => id === `A11Y|${file}|${rule}|Checkbox`).length, 1);
  has(result, 'A11Y', `A11Y|${file}|jsx-a11y/alt-text|img`);
  assert.equal(found.filter(id => id.includes('labelled-control')).length, 3);
  assert.equal(result.A11Y.units['skipped-spread'], 1);
});

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

test('A11Y: the excluded label-has-associated-control still throws here (named limit)', async t => {
  const { A11Y_EXCLUDED, A11Y_RULES } =
    await import('../../apps/web/eslint.screen-contract.config.mjs');
  assert.deepEqual(Object.keys(A11Y_EXCLUDED), ['jsx-a11y/label-has-associated-control']);
  assert.equal(A11Y_RULES['jsx-a11y/label-has-associated-control'], undefined);
  assert.ok(Object.keys(A11Y_RULES).length >= 30);
  const { createRequire } = await import('node:module');
  const req = createRequire(new URL('../../apps/web/package.json', import.meta.url));
  const { Linter } = req('eslint');
  const jsxA11y = req('eslint-plugin-jsx-a11y');
  const linter = new Linter({ configType: 'flat' });
  const config = [
    {
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { 'jsx-a11y': jsxA11y },
      rules: { 'jsx-a11y/label-has-associated-control': 'error' },
    },
  ];
  // When this stops throwing (the override or the plugin changed), put the rule back in the set.
  assert.throws(
    () => linter.verify('const a = <label>Name <input /></label>;', config),
    /minimatch/u
  );
});

const pkgJson = (name, exportsMap) => JSON.stringify({ name, private: true, exports: exportsMap });

test('CHK-15a: a value edge resolves under the value conditions, a type edge under types (B5)', async t => {
  const root = tree(t, {
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
