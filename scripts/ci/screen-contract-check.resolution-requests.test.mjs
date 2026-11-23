// D-1's request rules: queries and fragments, request forms, `browser` fields, non-literal module
// requests, `node_modules` and backslash requests, and the refusal wording.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { lint, tree } from './fixtures/screen-contract-check/harness.mjs';
import {
  W,
  FROM,
  X,
  rejects,
  SCANNER_PR,
  both,
} from './fixtures/screen-contract-check/resolution-fixtures.mjs';
import { kindOfSpecifier, resolverFor } from './screen-contract/specifiers.mjs';

// r5: a query or fragment on a relative or `@/` request is refused (webpack loads the path part
// through a loader D-1 does not model), except on the two reviewed edges, which name the path part.
test('D-1: a request with a query or fragment is refused outside the reviewed edges', t => {
  const resolver = resolverFor(
    fs.realpathSync(
      tree(t, {
        'apps/web/public/offline.html': '<html></html>\n',
        'packages/database/src/constants.ts': X,
        [`${W}/components/x.ts`]: X,
      })
    )
  );
  const refused = /a request with a query or fragment; .*scanner PR first/u;
  for (const spec of [
    './x?raw',
    './x#frag',
    '@/components/x?asset',
    '../../../../packages/database/src/constants?asset',
  ])
    assert.throws(() => resolver.resolveTargets(FROM, spec), refused, spec);
  assert.throws(() => resolver.resolveTargets(FROM, './x?raw', 'type'), refused);
  const reviewed = '../../../public/offline.html?raw';
  for (const from of [
    `${W}/features/help-now/sw-test-utils.ts`,
    `${W}/lib/pwa/pwa-i18n-contract.test.ts`,
  ])
    assert.deepEqual(resolver.resolveTargets(from, reviewed), ['apps/web/public/offline.html']);
  // The reviewed specifier from another file, or another query on a reviewed file, is refused.
  assert.throws(() => resolver.resolveTargets(`${W}/lib/pwa/other.ts`, reviewed), refused);
  assert.throws(
    () =>
      resolver.resolveTargets(
        `${W}/features/help-now/sw-test-utils.ts`,
        '../../../public/offline.html?url'
      ),
    refused
  );
});

test('D-1: a query edge in a linted file makes the scan a scanner error', async t => {
  await assert.rejects(
    lint(
      tree(t, {
        [`${W}/components/q.tsx`]: "import t from './x?raw';\nexport const Q = () => t;\n",
        [`${W}/components/x.ts`]: X,
      })
    ),
    /a request with a query or fragment/u
  );
});

// Request forms D-1 does not model are refused where an edge is classified, so no rule can take one
// for an external package and skip it: webpack's `roots` (`/…`), inline loaders (`!`), package
// imports (`#…`), URL schemes other than `node:`, and Next's built-in aliases into the app.
test('D-1: a request form D-1 does not model is refused, wherever it is classified', async t => {
  const refused = /is a form D-1 does not model; .*scanner PR first/u;
  for (const spec of [
    '/src/actions/x',
    '#db',
    '!!raw-loader!./x',
    'raw-loader!./x',
    './x!',
    'file:///repo/packages/database/src/index.ts',
    'data:text/javascript,export default 1',
    'https://example.test/x.js',
    'private-next-root-dir/src/actions/x',
    'private-next-app-dir/x',
    'private-next-pages/_app',
    'private-dot-next/server/x',
    'private-next-rsc-action-validate',
    'private-next-instrumentation-client-user',
  ])
    assert.throws(() => kindOfSpecifier(spec), refused, spec);
  for (const [spec, kind] of [
    ['node:fs', 'external'],
    ['react', 'external'],
    ['next/dist/x', 'external'],
    ['@interdomestik/ui', 'workspace'],
    ['./x', 'relative'],
    ['@/x', 'alias'],
  ])
    assert.equal(kindOfSpecifier(spec), kind, spec);
  // In a linted file the scan is a scanner error, for a value and for a type edge.
  for (const line of [
    "import { db } from 'private-next-root-dir/../../packages/database/src';",
    "import type { T } from '/src/t';",
  ])
    await assert.rejects(
      lint(tree(t, { [`${W}/components/f.tsx`]: `${line}\nexport const F = () => null;\n` })),
      refused,
      line
    );
});

// The client build's `aliasFields: ['browser']` lets a `package.json` remap a relative request
// inside its package; a `browser` field anywhere in the tree is refused.
test('D-1: a package.json with a browser field is refused', t => {
  const browser = JSON.stringify({ name: 'x', browser: { './src/a.ts': './src/b.ts' } });
  for (const rel of ['apps/web/package.json', 'packages/ui/package.json', `${W}/lib/package.json`])
    rejects(
      t,
      { [rel]: browser },
      both(new RegExp(`${rel.replaceAll('/', '\\/')} has a browser field`, 'u'), SCANNER_PR)
    );
  rejects(t, { 'apps/web/package.json': '{ nope' }, /apps\/web\/package\.json is not parseable/u);
  // node_modules is not the scanned tree's source.
  assert.ok(resolverFor(fs.realpathSync(tree(t, { 'node_modules/x/package.json': browser }))));
});

// A module request that is not a literal specifier builds a webpack context module, loads a file by
// URL, or escapes the bundler: refused in a linted file unless it is a reviewed occurrence (file and
// exact text). The reviewed ones load message catalogues, test helpers and Node-only tooling.
test('D-1: a module request that is not a literal specifier is refused unless reviewed', async t => {
  const refused = /loads a module by .*, a request D-1 does not model; .*scanner PR first/u;
  const screen = `${W}/components/f.tsx`;
  const lintWith = (rel, body) =>
    lint(
      tree(t, { [rel]: `${body}\nexport const F = () => null;\n`, [`${W}/components/x.ts`]: X })
    );
  for (const body of [
    'const name = "x"; export const m = () => import(`../../../../packages/database/src/${name}`);',
    'const name = "./x"; export const m = () => import(name);',
    'const name = "./x"; export const m = require(name);',
    "export const m = require('./x', 1);",
    "export const ctx = require.context('../../../../packages/database/src', true);",
    "export const id = require.resolve('./x');",
    'export const r = require;',
    "define(['./x'], x => x);",
    "import { createRequire } from 'node:module'; export const r = createRequire(import.meta.url);",
    "export const ctx = import.meta.webpackContext('./');",
    "export const w = () => new Worker(new URL('./x.ts', import.meta.url));",
    "export const u = new URL('../../../../packages/database/src/index.ts', import.meta.url);",
  ])
    await assert.rejects(lintWith(screen, body), refused, body);
  // Literal requests, `import.meta.url` on its own, and non-request uses of the name are judged as
  // before.
  for (const body of [
    "import { x } from './x'; export const m = () => import('./x'); export const n = require('./x'); export const y = x;",
    "import { fileURLToPath } from 'node:url'; export const here = fileURLToPath(import.meta.url);",
    'declare function require(id: string): unknown; export const o = { require: 1 }; export type R = typeof require;',
  ])
    assert.ok(await lintWith(screen, body), body);
  // A reviewed occurrence is accepted in its own file only.
  const reviewed =
    'export async function load(locale: string, namespace: string) { return import(`../messages/${locale}/${namespace}.json`); }';
  assert.ok(await lintWith(`${W}/i18n/messages.ts`, reviewed));
  await assert.rejects(lintWith(`${W}/i18n/other.ts`, reviewed), refused);
});

test('D-1: createRequire aliases and value references are refused', async t => {
  const refused = /loads a module by .*, a request D-1 does not model; .*scanner PR first/u;
  const imported = "import { createRequire } from 'node:module';";
  for (const body of [
    "import { createRequire as makeRequire } from 'node:module'; const load = makeRequire(import.meta.url); load('@interdomestik/database');",
    "import { 'createRequire' as makeRequire } from 'other-module';",
    "export { createRequire as makeRequire } from 'node:module';",
    `${imported} export { createRequire as makeRequire };`,
    'const { createRequire: makeRequire } = mod;',
    "const { ['createRequire']: makeRequire } = mod;",
    'const { createRequire = fallback } = mod;',
    'const makeRequire = mod.createRequire;',
    "const makeRequire = mod['createRequire'];",
    "const load = mod['createRequire'](import.meta.url);",
    'const load = mod.createRequire(import.meta.url);',
    `${imported} const makeRequire = createRequire;`,
    `${imported} const methods = { createRequire };`,
    `${imported} const makeRequire = createRequire.bind(null);`,
    'import makeRequire = mod.createRequire;',
  ])
    await assert.rejects(lint(tree(t, { [`${W}/components/f.tsx`]: body })), refused, body);
});

test('D-1: the reviewed direct createRequire call is accepted by file and exact text', async t => {
  const refused = /loads a module by .*, a request D-1 does not model; .*scanner PR first/u;
  const screen = `${W}/components/f.tsx`;
  const reviewedFile = 'packages/database/src/migration-callback-source-verifier.ts';
  const imported = "import { createRequire } from 'node:module';\n";
  const reviewed = `${imported}const requireFromHere = createRequire(import.meta.url);`;
  const lintWith = (rel, body) => lint(tree(t, { [rel]: body }));
  assert.ok(await lintWith(screen, imported));
  assert.ok(await lintWith(screen, 'const { createRequire } = mod;'));
  assert.ok(await lintWith(reviewedFile, reviewed));
  await assert.rejects(lintWith(screen, reviewed), refused);
  await assert.rejects(
    lintWith(reviewedFile, reviewed.replace('import.meta.url', ' import.meta.url ')),
    refused
  );
});

// r6: a relative request through node_modules can follow a pnpm workspace link to tracked source,
// which the scanner's tree does not show: refused.
test('D-1: a relative or @/ request through node_modules is refused', async t => {
  const resolver = resolverFor(fs.realpathSync(tree(t, {})));
  for (const spec of [
    '../../node_modules/@interdomestik/database/src/index.ts',
    './node_modules/x',
    '@/../node_modules/@interdomestik/database',
  ])
    assert.throws(
      () => resolver.resolveTargets(FROM, spec),
      both(/a request through node_modules/u, SCANNER_PR),
      spec
    );
  await assert.rejects(
    lint(
      tree(t, {
        [`${W}/app/x/page.tsx`]:
          "import { db } from '../../../node_modules/@interdomestik/database';\nexport default () => db;\n",
      })
    ),
    /a request through node_modules/u
  );
});

// r7: a backslash in a relative or `@/` request is refused (it can reach node_modules unseen).
test('D-1: a relative or @/ request with a backslash is refused', t => {
  const resolver = resolverFor(fs.realpathSync(tree(t, {})));
  for (const spec of [
    '../node_modules\\@interdomestik/database',
    '@/..\\..\\node_modules/x',
    '.\\x',
  ])
    assert.throws(
      () => resolver.resolveTargets(FROM, spec),
      both(/a request with a backslash/u, SCANNER_PR),
      spec
    );
});

// r7: every refusal of the fixed configuration ends with the scanner-PR sentence, also when a rule
// raises it inside ESLint (which appends the file and rule after it).
test('D-1: refusals end with the scanner-PR sentence, in the resolver and through the lint', async t => {
  const END = /; a change to it needs a scanner PR first \(WP-05 flip, D-1 fixed configuration\)$/u;
  const ending = error => END.test(error.message);
  rejects(t, { 'packages/ui/package.json': '{ nope' }, ending);
  rejects(t, { 'packages/ui/package.json': '{ "version": "1.0.0" }\n' }, ending);
  rejects(t, { 'apps/web/tsconfig.json': null }, ending);
  rejects(t, { 'tsconfig.json': '   \n' }, ending);
  rejects(t, { 'apps/web/tsconfig.json': '{ nope' }, ending);
  // Sol r1: ESLint's own suffix is cut at its last occurrence, not at the same words in a request.
  await assert.rejects(
    lint(
      tree(t, {
        [`${W}/app/x/page.tsx`]:
          "import a from './node_modules/a\\nOccurred while linting b';\nexport default () => a;\n",
      })
    ),
    error => ending(error) && /a request through node_modules/u.test(error.message)
  );
  await assert.rejects(
    lint(
      tree(t, {
        [`${W}/app/x/page.tsx`]: "import a from '../x\\\\y';\nexport default () => a;\n",
      })
    ),
    error => ending(error) && !/Occurred while linting/u.test(error.message)
  );
});
