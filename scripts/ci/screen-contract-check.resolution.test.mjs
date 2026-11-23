// D-1 of the WP-05 flip (r1-B4, r2-B3, r3-B2/B3): a relative or `@/` request names the file
// TypeScript selects (`ts.resolveModuleName`, Bundler, the caller's options) and the file Next's
// webpack build selects, deduplicated; nothing else. `resolveFile` keeps TypeScript's pick.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import { ids, lint, tree, webTsconfig } from './fixtures/screen-contract-check/harness.mjs';
import { has, lacks } from './fixtures/screen-contract-check/rules-fixtures.mjs';
import { WEBPACK_EXTENSIONS } from './screen-contract/resolution.mjs';
import { kindOfSpecifier, resolverFor } from './screen-contract/specifiers.mjs';

const W = 'apps/web/src';
const FROM = `${W}/components/caller.tsx`;
const X = 'export const x = 1;\n';
const targetsIn = (t, files, specifier, from = FROM) => {
  const resolver = resolverFor(fs.realpathSync(tree(t, files)));
  return {
    targets: [...resolver.resolveTargets(from, specifier)].sort(),
    file: resolver.resolveFile(from, specifier),
  };
};

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
  assert.deepEqual([...resolver.resolveTargets(from, '@/components/item', 'import')].sort(), [
    `${W}/components/item.d.ts`,
    `${W}/components/item.js`,
  ]);
  lacks(await lint(tree(t, files)), 'CHK-15a', `CHK-15a|${from}|`);
  const valueImport = {
    ...files,
    [`${W}/actions/do.ts`]:
      "'use server';\nimport { item } from '@/components/item';\nexport async function run() { return item; }\n",
  };
  has(await lint(tree(t, valueImport)), 'CHK-15a', `CHK-15a|${from}|@/components/item`);
});

const WEB = paths =>
  `{ "compilerOptions": { "moduleResolution": "bundler", "paths": ${JSON.stringify(paths)} } }\n`;
const rejects = (t, files, pattern) =>
  assert.throws(() => resolverFor(fs.realpathSync(tree(t, files))), pattern);
const SCANNER_PR = /scanner PR first/u;
// Every pattern matches the error's message (a validation function for assert.throws).
const both =
  (...patterns) =>
  error =>
    patterns.every(pattern => pattern.test(error.message));

test('D-1: tsconfig settings the resolver does not model are scanner errors', t => {
  rejects(
    t,
    {
      'apps/web/tsconfig.json':
        '{ "extends": "./base.json", "compilerOptions": { "moduleResolution": "bundler", "paths": { "@/*": ["./src/*"] } } }\n',
    },
    both(/extends/u, SCANNER_PR)
  );
  for (const option of [
    'verbatimModuleSyntax',
    'preserveValueImports',
    'importsNotUsedAsValues',
    'rootDirs',
    'moduleSuffixes',
    'customConditions',
    'allowArbitraryExtensions',
    'resolvePackageJsonExports',
    'resolvePackageJsonImports',
    'typeRoots',
  ])
    rejects(
      t,
      { 'apps/web/tsconfig.json': webTsconfig({ [option]: [] }) },
      both(new RegExp(option, 'u'), SCANNER_PR)
    );
  rejects(
    t,
    { 'apps/web/tsconfig.json': webTsconfig({ moduleResolution: 'node' }) },
    both(/moduleResolution/u, SCANNER_PR)
  );
});

// The fixed configuration (the owner's decision B, 2026-11-23): the exact `@/*` mapping and the
// exact `paths` and `baseUrl` of both tsconfigs; every other value is refused, naming the reason
// and that a change needs a scanner PR first.
test('D-1: tsconfig paths and baseUrl other than the fixed ones are refused', t => {
  const real = rel =>
    JSON.parse(
      JSON.stringify(
        ts.parseConfigFileTextToJson(rel, fs.readFileSync(rel, 'utf8')).config.compilerOptions
      )
    );
  const web = real('apps/web/tsconfig.json');
  const root = real('tsconfig.json');
  const mapping = /has an @\/\* mapping other than the fixed/u;
  const other = /has paths or baseUrl other than the fixed configuration's/u;
  for (const alias of [['./src/*', './src'], ['./types/*.d.ts', './src/*'], ['./src/lib/*']])
    rejects(
      t,
      { 'apps/web/tsconfig.json': WEB({ ...web.paths, '@/*': alias }) },
      both(mapping, SCANNER_PR)
    );
  // r5: a root mapping that differs from the web one (B2), or erases a crossing with `..` (r5).
  for (const alias of [['packages/database/src/*'], ['apps/web/src/../../../packages/*/../src/*']])
    rejects(
      t,
      {
        'tsconfig.json': `${JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', baseUrl: '.', paths: { ...root.paths, '@/*': alias } } })}\n`,
      },
      both(/^tsconfig\.json has an @\/\* mapping/u, SCANNER_PR)
    );
  // Any other key, a changed workspace entry, or another baseUrl.
  rejects(
    t,
    { 'apps/web/tsconfig.json': WEB({ ...web.paths, '@/components/*': ['./src/ui/*'] }) },
    both(other, SCANNER_PR)
  );
  const { '@interdomestik/ui': _ui, ...withoutUi } = web.paths;
  rejects(t, { 'apps/web/tsconfig.json': WEB(withoutUi) }, both(other, SCANNER_PR));
  rejects(
    t,
    {
      'tsconfig.json': `${JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', baseUrl: './apps/..', paths: root.paths } })}\n`,
    },
    both(other, SCANNER_PR)
  );
  // The fixed value, with its keys in another order, is accepted (a value, not a text, is pinned).
  const reordered = Object.fromEntries(Object.entries(web.paths).reverse());
  assert.ok(resolverFor(fs.realpathSync(tree(t, { 'apps/web/tsconfig.json': WEB(reordered) }))));
});

const REAL_NEXT = Object.freeze({
  'apps/web/next.config.mjs': fs.readFileSync('apps/web/next.config.mjs', 'utf8'),
  'apps/web/src/lib/supabase-deployment.mjs': fs.readFileSync(
    'apps/web/src/lib/supabase-deployment.mjs',
    'utf8'
  ),
  'pnpm-lock.yaml': fs.readFileSync('pnpm-lock.yaml', 'utf8'),
});

test('D-1: the real configs load, and an absent next.config is Next’s defaults', t => {
  const real = fs.realpathSync(
    tree(t, {
      'tsconfig.json': fs.readFileSync('tsconfig.json', 'utf8'),
      'apps/web/tsconfig.json': fs.readFileSync('apps/web/tsconfig.json', 'utf8'),
      ...REAL_NEXT,
    })
  );
  assert.ok(resolverFor(real));
  assert.ok(resolverFor(fs.realpathSync(tree(t, {}))));
});

// The fixed Next configuration: today's exact `next.config.mjs` and helper (by sha256), no other
// `next.config` file, and the four reviewed wrappers at their reviewed versions without a patch.
test('D-1: a Next configuration other than the fixed one is refused', t => {
  const config = REAL_NEXT['apps/web/next.config.mjs'];
  const notFixed = /is not the fixed configuration's exact file/u;
  rejects(
    t,
    { ...REAL_NEXT, 'apps/web/next.config.mjs': `${config}\n` },
    both(notFixed, SCANNER_PR)
  );
  rejects(
    t,
    {
      ...REAL_NEXT,
      'apps/web/next.config.mjs': config.replace(
        'serverExternalPackages',
        'serverExternalPackages '
      ),
    },
    both(/next\.config\.mjs is not/u, SCANNER_PR)
  );
  rejects(
    t,
    { ...REAL_NEXT, 'apps/web/src/lib/supabase-deployment.mjs': '// changed\n' },
    both(/supabase-deployment\.mjs is not the fixed/u, SCANNER_PR)
  );
  rejects(
    t,
    { ...REAL_NEXT, 'apps/web/src/lib/supabase-deployment.mjs': null },
    both(/supabase-deployment\.mjs .*is missing/u, SCANNER_PR)
  );
  for (const ext of ['js', 'cjs', 'ts', 'mts', 'cts']) {
    rejects(
      t,
      { [`apps/web/next.config.${ext}`]: 'export default {};\n' },
      both(new RegExp(`next\\.config\\.${ext} is not the fixed`, 'u'), SCANNER_PR)
    );
    rejects(
      t,
      { ...REAL_NEXT, [`apps/web/next.config.${ext}`]: 'export default {};\n' },
      SCANNER_PR
    );
  }
  rejects(
    t,
    { ...REAL_NEXT, 'pnpm-lock.yaml': null },
    both(/pnpm-lock\.yaml is missing/u, SCANNER_PR)
  );
});

test('D-1: a wrapper at another version, or with a pnpm patch, is refused', t => {
  const lock = REAL_NEXT['pnpm-lock.yaml'];
  // In the `apps/web` importer, `@sentry/nextjs` resolves `10.75.2(<peers>)`.
  const sentry = /( {6}'@sentry\/nextjs':\n {8}specifier: [^\n]+\n {8}version: )10\.75\.2/u;
  assert.match(lock, sentry);
  rejects(
    t,
    { ...REAL_NEXT, 'pnpm-lock.yaml': lock.replace(sentry, '$110.76.0') },
    both(/@sentry\/nextjs 10\.76\.0, not the reviewed 10\.75\.2/u, SCANNER_PR)
  );
  // r5: pnpm's own patch group right after the version.
  rejects(
    t,
    {
      ...REAL_NEXT,
      'pnpm-lock.yaml': lock.replace(sentry, `$110.75.2(patch_hash=${'a'.repeat(64)})`),
    },
    both(/@sentry\/nextjs 10\.75\.2 with a pnpm patch/u, SCANNER_PR)
  );
  // r5: a wrapper named in `patchedDependencies`.
  const patched = lock.replace(
    /^patchedDependencies:\n/mu,
    'patchedDependencies:\n  next-intl@4.14.5:\n    hash: abc\n    path: patches/next-intl@4.14.5.patch\n'
  );
  assert.notEqual(patched, lock);
  rejects(
    t,
    { ...REAL_NEXT, 'pnpm-lock.yaml': patched },
    both(/next-intl 4\.14\.5 with a pnpm patch/u, SCANNER_PR)
  );
  // A peer's patch (Next's own, inside a wrapper's peer list) is not the wrapper's: the real
  // lockfile has it on next-axiom and next-intl, and loads (the test above).
  assert.match(lock, /version: 4\.14\.5\([^\n]*next@[^\n]*patch_hash=/u);
});

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

// The extension list D-1 models is the installed Next's: a Next upgrade that changes it fails here
// (the lead's note: 16.3.8 → 16.4.x). Read from the build's source text, `resolveConfig.extensions`.
test('D-1: WEBPACK_EXTENSIONS equals the installed Next build’s resolve.extensions', () => {
  const web = createRequire(path.resolve('apps/web/package.json'));
  const file = path.join(
    path.dirname(web.resolve('next/package.json')),
    'dist/build/webpack-config.js'
  );
  const text = fs.readFileSync(file, 'utf8');
  const block = /const resolveConfig = \{[\s\S]*?extensions: \[([^\]]*)\]/u.exec(text);
  assert.ok(block, 'resolveConfig.extensions not found in Next’s webpack-config.js');
  const installed = [...block[1].matchAll(/'([^']+)'/gu)].map(m => m[1]);
  assert.deepEqual([...WEBPACK_EXTENSIONS], installed);
  assert.doesNotMatch(text.slice(block.index, block.index + 2000), /mainFiles:/u);
});

// An oracle written apart from the resolver: webpack's order as Next 16 configures `next build
// --webpack` (the exact request, then each extension, then the directory index). Its pick is always
// among the targets, and every target is its pick or TypeScript's.
function oraclePick(exists, base) {
  for (const candidate of [base, ...WEBPACK_EXTENSIONS.map(e => base + e)])
    if (exists(candidate)) return candidate;
  for (const e of WEBPACK_EXTENSIONS) if (exists(`${base}/index${e}`)) return `${base}/index${e}`;
  return null;
}

test('D-1: webpack’s pick is among at most two targets for every file set and spelling', t => {
  const NAMES = [
    'save.ts',
    'save.tsx',
    'save.js',
    'save.mjs',
    'save.d.ts',
    'save/index.ts',
    'save/index.js',
  ];
  const SPECS = ['save', 'save.js', 'save.mjs', 'save.ts', 'save.jsx'];
  const files = {};
  const sets = NAMES.reduce((acc, n) => [...acc, ...acc.map(s => [...s, n])], [[]]).slice(1);
  sets.forEach((set, i) => {
    for (const name of set) files[`${W}/m${i}/${name}`] = X;
  });
  const root = fs.realpathSync(tree(t, files));
  const resolver = resolverFor(root);
  const exists = rel => fs.existsSync(`${root}/${rel}`) && fs.statSync(`${root}/${rel}`).isFile();
  let checked = 0;
  sets.forEach((_, i) => {
    for (const spec of SPECS) {
      const targets = resolver.resolveTargets(FROM, `@/m${i}/${spec}`);
      assert.ok(targets.length <= 2, `${i} ${spec} ${targets}`);
      const pick = oraclePick(exists, `${W}/m${i}/${spec}`);
      if (!pick) continue;
      checked += 1;
      assert.ok(targets.includes(pick), `${i} ${spec} ${pick}`);
    }
  });
  assert.ok(checked > 200, String(checked));
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

// r6: the wrapper's own lockfile record is pinned too: a different tarball at the same version
// (another integrity) is refused.
test('D-1: a wrapper with another lockfile integrity is refused', t => {
  const lock = REAL_NEXT['pnpm-lock.yaml'];
  const integrity =
    'sha512-ilzb3E7Kaskx/RQ355kCkxLxrHBtYS67pe6KO+F/O6s53f5t4sVwz4gE2Mz4ScghDXeKM+ccyB5GMq9dlkQ35A==';
  assert.equal(lock.split(integrity).length, 2);
  rejects(
    t,
    { ...REAL_NEXT, 'pnpm-lock.yaml': lock.replace(integrity, `sha512-${'A'.repeat(86)}==`) },
    both(/@sentry\/nextjs 10\.75\.2 with another lockfile integrity/u, SCANNER_PR)
  );
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

// r7: the wrapper records are read with a YAML parser; a comment cannot stand in for a value.
test('D-1: a comment in the lockfile cannot mask a wrapper version or integrity change', t => {
  const lock = REAL_NEXT['pnpm-lock.yaml'];
  const intl = /( {6}next-intl:\n {8}specifier: [^\n]+\n {8}version: )4\.14\.5([^\n]*\n)/u;
  assert.match(lock, intl);
  const version = lock.replace(intl, '$14.15.0$2        # version: 4.14.5\n');
  rejects(
    t,
    { ...REAL_NEXT, 'pnpm-lock.yaml': version },
    both(/next-intl 4\.15\.0, not the reviewed 4\.14\.5/u, SCANNER_PR)
  );
  const old =
    'sha512-9sPJh5ITJbP28HZ5obuFAMC4RwW/mhEvHiGVHXPWL0uRbF2RrjHWz8PcUmLaH2oca79ak2ayQz+uRSALZN9xSw==';
  const record = `  next-intl@4.14.5:\n    resolution:\n      {\n        integrity: ${old},\n      }`;
  assert.equal(lock.split(record).length, 2);
  const masked = lock.replace(
    record,
    `  next-intl@4.14.5:\n    # integrity: ${old}\n    resolution:\n      {\n        integrity: sha512-${'B'.repeat(86)}==,\n      }`
  );
  rejects(
    t,
    { ...REAL_NEXT, 'pnpm-lock.yaml': masked },
    both(/next-intl 4\.14\.5 with another lockfile integrity/u, SCANNER_PR)
  );
  rejects(t, { ...REAL_NEXT, 'pnpm-lock.yaml': 'a: [\n' }, both(/not parseable/u, SCANNER_PR));
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
  for (const body of [
    "export const load = () => import('./x').then(module => module.x);",
    "export async function load() { const module = await import('./x'); return module.x; }",
    'export const e = typeof module;',
    // Sol r1: a local binding named `module` is not the CommonJS one.
    "import * as module from './x'; export const m = module; export const n = module['x'];",
    'export const p = () => Promise.resolve(1).then(module => Promise.resolve(module));',
    'export function q(module: Record<string, unknown>, k: string) { return module[k]; }',
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
