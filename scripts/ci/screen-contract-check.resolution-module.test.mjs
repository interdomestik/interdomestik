// D-1's CommonJS `module` and JSDoc edges (r6, r7, Sol r1-r3): `module.require` and `module[…]`,
// a bare `module` value, and JSDoc imports read through TypeScript's own parse.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ids, lint, tree } from './fixtures/screen-contract-check/harness.mjs';
import { W, X } from './fixtures/screen-contract-check/resolution-fixtures.mjs';
import { has, lacks } from './fixtures/screen-contract-check/rules-fixtures.mjs';

// r6: `module.require('<literal>')` is a CommonJS request webpack records, and a JSDoc `@import` or
// `import('…')` type in a JavaScript file is a type import TypeScript records: both are edges.
test('D-1: module.require and JSDoc type imports are edges (CHK-15b, CHK-15c)', async t => {
  const page = `${W}/app/x/page.jsx`;
  const comp = `${W}/components/c.jsx`;
  const cross = '../../../../packages/ui/src/components/avatar';
  const files = {
    [page]: "const { db } = module.require('@interdomestik/database');\nexport default () => db;\n",
    [comp]: [
      `/** @import { Avatar } from '${cross}' */`,
      `/** @param {import("${cross}").Props} p */`,
      'export const C = p => p;',
    ].join('\n'),
  };
  const result = await lint(tree(t, files));
  has(result, 'CHK-15c', `CHK-15c|${page}|@interdomestik/database`);
  assert.equal(ids(result, 'CHK-15b').filter(id => id === `CHK-15b|${comp}|${cross}`).length, 2);
  // In a TypeScript file a comment is no import (TypeScript reads JSDoc types only in JS files).
  const ts = await lint(
    tree(t, {
      [`${W}/components/c.tsx`]: `/** @import { A } from '${cross}' */\nexport const C = 1;\n`,
    })
  );
  lacks(ts, 'CHK-15b', `CHK-15b|${W}/components/c.tsx|`);
  // `module.require` other than a call with one literal is refused.
  const refused = /loads a module by .*, a request D-1 does not model; .*scanner PR first/u;
  for (const body of [
    'export const r = module.require;',
    "const n = './x'; export const m = module.require(n);",
  ])
    await assert.rejects(
      lint(tree(t, { [`${W}/components/f.jsx`]: `${body}\nexport const F = () => null;\n` })),
      refused,
      body
    );
});

// r7: `module['require']` is the same request as `module.require`; a computed member of `module`
// and a bare `module` read as a value are refused; a local named `module` used by member is not.
test('D-1: module[require] is an edge; module[k] and a bare module value are refused', async t => {
  const page = `${W}/app/x/page.jsx`;
  has(
    await lint(
      tree(t, {
        [page]:
          "const { db } = module['require']('@interdomestik/database');\nexport default () => db;\n",
      })
    ),
    'CHK-15c',
    `CHK-15c|${page}|@interdomestik/database`
  );
  const refused = /loads a module by .*, a request D-1 does not model; .*scanner PR first/u;
  for (const body of [
    "const k = 'require'; export const r = module[k]('./x');",
    "export const r = module['require'];",
    'const m = module; export const r = m;',
    'const { require: req } = module; export const r = req;',
    'export const f = () => module;',
  ])
    await assert.rejects(
      lint(tree(t, { [`${W}/components/f.jsx`]: `${body}\nexport const F = () => null;\n` })),
      refused,
      body
    );
  // Sol r2: an ambient or type-only `module` is erased by the emit, so the runtime one is read.
  for (const body of [
    'declare const module: { require(id: string): unknown }; export const m = module;',
    'declare global { var module: unknown } export const m = module;',
    'declare namespace N { const module: unknown; export const m = module; }',
    "import type module from './x'; export const m = module;",
  ])
    await assert.rejects(
      lint(
        tree(t, {
          [`${W}/components/f.ts`]: `${body}\nexport const F = () => null;\n`,
          [`${W}/components/x.ts`]: X,
        })
      ),
      refused,
      body
    );
  for (const body of [
    "export const load = () => import('./x').then(module => module.x);",
    "export async function load() { const module = await import('./x'); return module.x; }",
    'export const e = typeof module;',
    // Sol r1: a local binding named `module` is not the CommonJS one.
    "import * as module from './x'; export const m = module; export const n = module['x'];",
    'export const p = () => Promise.resolve(1).then(module => Promise.resolve(module));',
    'export function q(module: Record<string, unknown>, k: string) { return module[k]; }',
    // Sol r3: a plain namespace is emitted, so a parameter inside it is a runtime binding.
    'export namespace Labels { export function pick(module: string) { return module; } }',
    // Sol r2: a local binding's `module.require('…')` is a method call, no request or edge.
    "import * as module from './x'; export const r = module.require('./label?short');",
  ])
    assert.ok(
      await lint(
        tree(t, {
          [`${W}/components/f.ts`]: `${body}\nexport const F = () => null;\n`,
          [`${W}/components/x.ts`]: X,
        })
      ),
      body
    );
});

// r7: JSDoc imports come from TypeScript's own parse: a space before the parenthesis and a quoted
// export name are read as TypeScript reads them.
test('D-1: JSDoc imports follow TypeScript’s parse (spacing, quoted names)', async t => {
  const comp = `${W}/components/c.js`;
  const cross = '../../../../packages/ui/src/components/avatar';
  const result = await lint(
    tree(t, {
      [comp]: [
        `/** @import { "quoted name" as Q } from '${cross}' */`,
        `/** @type {import ('${cross}').W} */`,
        'export const C = 1;',
      ].join('\n'),
    })
  );
  assert.equal(ids(result, 'CHK-15b').filter(id => id === `CHK-15b|${comp}|${cross}`).length, 2);
  lacks(result, 'CHK-15b', `CHK-15b|${comp}|quoted name`);
});
