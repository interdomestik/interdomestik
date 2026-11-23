// D-1 of the WP-05 flip (r1-B4, r2-B3, r3-B2/B3): a relative or `@/` request names the file
// TypeScript selects (`ts.resolveModuleName`, Bundler, the caller's options) and the file Next's
// webpack build selects, deduplicated; nothing else. `resolveFile` keeps TypeScript's pick.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import { lint, tree, webTsconfig } from './fixtures/screen-contract-check/harness.mjs';
import { has, lacks } from './fixtures/screen-contract-check/rules-fixtures.mjs';
import { WEBPACK_EXTENSIONS } from './screen-contract/resolution.mjs';
import { resolverFor } from './screen-contract/specifiers.mjs';

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
  assert.throws(() => resolver.resolveTargets(FROM, '@/lib/pkg'), /package\.json/u);
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
    /extends/u
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
      new RegExp(option, 'u')
    );
  rejects(
    t,
    { 'apps/web/tsconfig.json': webTsconfig({ moduleResolution: 'node' }) },
    /moduleResolution/u
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
  rejects(t, { ...REAL_NEXT, 'pnpm-lock.yaml': null }, /pnpm-lock\.yaml is missing/u);
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
