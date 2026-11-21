import assert from 'node:assert/strict';
import test from 'node:test';

import { ids, lint, tree } from './fixtures/screen-contract-check/harness.mjs';
import { W } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { has, lacks } from './fixtures/screen-contract-check/rules-fixtures.mjs';

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
