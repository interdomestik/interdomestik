// D-1's fixed configuration (the owner's decision B, 2026-11-23): the tsconfigs, the Next config
// and its helper, and the reviewed wrappers' lockfile records; every other value is refused with
// the scanner-PR sentence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import { tree, webTsconfig } from './fixtures/screen-contract-check/harness.mjs';
import {
  WEB,
  rejects,
  SCANNER_PR,
  both,
  REAL_NEXT,
} from './fixtures/screen-contract-check/resolution-fixtures.mjs';
import { resolverFor } from './screen-contract/specifiers.mjs';

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
