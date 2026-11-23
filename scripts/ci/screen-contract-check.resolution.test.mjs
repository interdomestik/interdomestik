// D-1 of the WP-05 flip (r1-B4, r2-B3, r3-B2/B3): a relative or `@/` request names the file
// TypeScript selects (`ts.resolveModuleName`, Bundler, the caller's options) and the file Next's
// webpack build selects, deduplicated; nothing else. `resolveFile` keeps TypeScript's pick.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { lint, tree } from './fixtures/screen-contract-check/harness.mjs';
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
  const allowJs =
    '{ "compilerOptions": { "moduleResolution": "bundler", "allowJs": true, "paths": { "@/*": ["./src/*"] } } }\n';
  const files = { 'apps/web/tsconfig.json': allowJs, [`${W}/components/x.jsx`]: X };
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

// r4-S1: Next's paths plugin passes over a substitution that ends in `.d.ts` and tries the next.
test('D-1: a @/* substitution ending in .d.ts is skipped by the webpack pick, as Next does', t => {
  const files = {
    'apps/web/tsconfig.json':
      '{ "compilerOptions": { "moduleResolution": "bundler", "paths": { "@/*": ["./types/*.d.ts", "./src/*"] } } }\n',
    'apps/web/types/save.d.ts': 'export declare const x: number;\n',
    [`${W}/save.js`]: X,
  };
  const got = targetsIn(t, files, '@/save');
  assert.ok(got.targets.includes(`${W}/save.js`), JSON.stringify(got.targets));
  assert.ok(!got.targets.includes(`${W}/save.js.d.ts`));
});

// r4-S2b: Next installs one paths plugin, from the web app's tsconfig, for every module of the
// build; TypeScript still compiles a package with the root config.
test('D-1: a package caller gets webpack’s pick through the web mapping, TypeScript’s through root', t => {
  const files = {
    'tsconfig.json':
      '{ "compilerOptions": { "moduleResolution": "bundler", "baseUrl": ".", "paths": { "@/*": ["apps/web/src/lib/*"] } } }\n',
    [`${W}/x.ts`]: X,
    [`${W}/lib/x.ts`]: X,
  };
  const got = targetsIn(t, files, '@/x', 'packages/domain-claims/src/edge.ts');
  assert.deepEqual(got.targets, [`${W}/lib/x.ts`, `${W}/x.ts`]);
  assert.equal(got.file, `${W}/lib/x.ts`);
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
      {
        'apps/web/tsconfig.json': `{ "compilerOptions": { "moduleResolution": "bundler", "${option}": [], "paths": { "@/*": ["./src/*"] } } }\n`,
      },
      new RegExp(option, 'u')
    );
  rejects(
    t,
    {
      'apps/web/tsconfig.json':
        '{ "compilerOptions": { "moduleResolution": "node", "paths": { "@/*": ["./src/*"] } } }\n',
    },
    /moduleResolution/u
  );
  rejects(
    t,
    { 'apps/web/tsconfig.json': WEB({ '@/*': ['./src/*'], '@/components/*': ['./src/ui/*'] }) },
    /@\/components\/\*/u
  );
});

test('D-1: workspace paths keys are accepted, and the real configs load', t => {
  const root = fs.realpathSync(
    tree(t, {
      'apps/web/tsconfig.json': WEB({
        '@/*': ['./src/*'],
        '@interdomestik/ui': ['../../packages/ui/src'],
        '@interdomestik/ui/*': ['../../packages/ui/src/*'],
      }),
    })
  );
  assert.ok(resolverFor(root));
  const real = fs.realpathSync(
    tree(t, {
      'tsconfig.json': fs.readFileSync('tsconfig.json', 'utf8'),
      'apps/web/tsconfig.json': fs.readFileSync('apps/web/tsconfig.json', 'utf8'),
      'apps/web/next.config.mjs': fs.readFileSync('apps/web/next.config.mjs', 'utf8'),
      'pnpm-lock.yaml': fs.readFileSync('pnpm-lock.yaml', 'utf8'),
      'apps/web/src/lib/supabase-deployment.mjs': fs.readFileSync(
        'apps/web/src/lib/supabase-deployment.mjs',
        'utf8'
      ),
    })
  );
  assert.ok(resolverFor(real));
});

const nextConfig = (t, text, extra = {}) =>
  resolverFor(fs.realpathSync(tree(t, { 'apps/web/next.config.mjs': text, ...extra })));
const hook = body => `export default { webpack(config) { ${body} return config; } };\n`;

test('D-1: next.config that changes webpack resolution is a scanner error', t => {
  const refused = [
    [
      'export default { experimental: { extensionAlias: { ".js": [".ts"] } } };\n',
      /extensionAlias/u,
    ],
    [hook('config.resolve.extensions = [".ts"];'), /resolve/u],
    [hook('config.resolve.mainFiles.push("main");'), /resolve/u],
    [hook('config.resolve.modules.unshift("src");'), /resolve/u],
    [hook('config.resolve = { ...config.resolve };'), /resolve/u],
    [hook('config.resolve.alias = { ...config.resolve.alias, x: "y" };'), /resolve/u],
    [hook('config.resolve.alias["@/lib/x"] = "./y";'), /resolve/u],
    [hook('config.resolve.alias["./x"] = "./y";'), /resolve/u],
    [hook('config.resolve.alias[name] = "./y";'), /resolve/u],
    [hook('config["resolve"].extensions = [];'), /resolve/u],
    [hook('const { resolve } = config; resolve.extensions = [];'), /resolve/u],
    [hook('return { ...config, resolve: {} };'), /resolve/u],
    [hook('config.plugins.push(new X());'), /plugins/u],
    // r4-S2a: another tsconfig means other `paths`; refused rather than modelled.
    ['export default { typescript: { tsconfigPath: "tsconfig.build.json" } };\n', /tsconfigPath/u],
    [
      "import { createRequire } from 'node:module';\nconst r = createRequire(import.meta.url);\nexport default r('./x.cjs');\n",
      /createRequire/u,
    ],
  ];
  for (const [text, pattern] of refused) rejects(t, { 'apps/web/next.config.mjs': text }, pattern);
});

test('D-1: next.config imports are reviewed wrappers, builtins or checked local files', t => {
  rejects(
    t,
    { 'apps/web/next.config.mjs': "import withX from 'next-x';\nexport default withX({});\n" },
    /next-x.*not a reviewed/u
  );
  rejects(
    t,
    {
      'apps/web/next.config.mjs':
        "import { patch } from './local.mjs';\nexport default patch({});\n",
      'apps/web/local.mjs':
        'export const patch = c => ({ ...c, webpack(w) { w.resolve.modules = []; return w; } });\n',
    },
    /local\.mjs changes webpack resolution/u
  );
  rejects(
    t,
    { 'apps/web/next.config.mjs': "import './missing.mjs';\nexport default {};\n" },
    /missing\.mjs.*missing/u
  );
  // r4-B3: re-exports and literal `import()` are followed; a load it cannot name is refused.
  const PATCH =
    'export const patch = c => ({ ...c, webpack(w) { w.resolve.modules = []; return w; } });\n';
  rejects(
    t,
    {
      'apps/web/next.config.mjs': "export { default } from './local.mjs';\n",
      'apps/web/local.mjs': `${PATCH}export default {};\n`,
    },
    /local\.mjs changes webpack resolution/u
  );
  rejects(
    t,
    {
      'apps/web/next.config.mjs':
        "const { patch } = await import('./local.mjs');\nexport default patch({});\n",
      'apps/web/local.mjs': PATCH,
    },
    /local\.mjs changes webpack resolution/u
  );
  rejects(
    t,
    { 'apps/web/next.config.mjs': "export * from 'next-x';\nexport default {};\n" },
    /next-x.*not a reviewed/u
  );
  for (const call of ['await import(name)', 'require(name)', "require('./a', 1)"])
    rejects(
      t,
      { 'apps/web/next.config.mjs': `const name = './a.mjs';\nexport default ${call};\n` },
      /does not name literally/u
    );
  // r4-B3: a wrapper is accepted only at the version its review read, from the tree's lockfile.
  const SENTRY = "import { withSentryConfig } from '@sentry/nextjs';\nexport default {};\n";
  const lockWith = version =>
    `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    devDependencies:\n      '@sentry/nextjs':\n        specifier: 1.0.0\n        version: 1.0.0\n\n  apps/web:\n    dependencies:\n      '@sentry/nextjs':\n        specifier: ${version}\n        version: ${version}(next@16.4.5)\n\npackages:\n`;
  rejects(t, { 'apps/web/next.config.mjs': SENTRY }, /pnpm-lock\.yaml is missing/u);
  rejects(
    t,
    { 'apps/web/next.config.mjs': SENTRY, 'pnpm-lock.yaml': lockWith('10.76.0') },
    /@sentry\/nextjs 10\.76\.0 is not the reviewed 10\.75\.2/u
  );
  assert.ok(nextConfig(t, SENTRY, { 'pnpm-lock.yaml': lockWith('10.75.2') }));
  assert.ok(
    nextConfig(
      t,
      "import path from 'node:path';\nimport fs from 'fs';\nimport { withSentryConfig } from '@sentry/nextjs';\n" +
        `const dir = path.resolve('.'); require.resolve('x');\n` +
        hook(
          'config.resolve.alias["perf_hooks"] = false; config.resolve.alias["@scope/pkg/sub"] = false;'
        ),
      { 'pnpm-lock.yaml': lockWith('10.75.2') }
    )
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
