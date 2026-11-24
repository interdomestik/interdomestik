// What a relative or `@/` request loads (the WP-05 flip, D-1; r1-B4, r2-B3, r3-B2/B3). Its targets
// are the file each tool selects, never a guess: TypeScript's own pick (`ts.resolveModuleName`,
// moduleResolution Bundler, with the caller's options) and webpack's pick as Next's production
// build (`next build --webpack`) configures it. Both picks are judged, deduplicated, and reported
// once per edge. An exact asset (`x.module.css`) is webpack's pick.
//
// Webpack's order (`WEBPACK_EXTENSIONS`, read from Next's `webpack-config.js` and pinned by a test
// against the installed Next): the request itself, then the request with each extension, then a
// directory's `index` as is and with each extension; a directory with its own `package.json` is an error
// (webpack's `mainFields` are not modelled). An `@/` request substitutes the one fixed `@/*` entry,
// as Next's JsConfigPathsPlugin and TypeScript do.
//
// The model holds for one fixed configuration only (the owner's decision B, 2026-11-23), and the
// scanner refuses every other: the exact `next.config.mjs` and the helper it loads (by sha256), the
// reviewed wrapper versions without a pnpm patch, no other `next.config` file, the exact `@/*`
// mapping and `paths`/`baseUrl` of both tsconfigs, and no query or fragment on a relative or `@/`
// request outside two reviewed edges. A change to any of them needs a scanner PR first. Next's own
// aliases (`create-compiler-aliases.js`) and per-rule `resolve` blocks name packages only (read at
// 16.4.1); a later Next that aliases a relative or `@/` key is a named limit, and its extension list
// is pinned by the test against the installed Next.
import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { parseLockfile, wrapperRecords } from './lockfile.mjs';
import { readInside } from './paths.mjs';
import { refuse } from './refusal.mjs';

// Next 16 (`webpack-config.js` l. 576-584 of 16.4.1): `resolve.extensions` of the build.
export const WEBPACK_EXTENSIONS = Object.freeze([
  '.js',
  '.mjs',
  '.tsx',
  '.ts',
  '.jsx',
  '.json',
  '.wasm',
]);

// Webpack's file for a request path, or null. `isFile` answers for repo-relative paths.
export function webpackPick(isFile, base) {
  for (const candidate of [base, ...WEBPACK_EXTENSIONS.map(ext => base + ext)])
    if (isFile(candidate)) return candidate;
  if (isFile(`${base}/package.json`))
    refuse(`${base} is a directory with its own package.json, which D-1 does not model`);
  // The directory's `index` as is, then with each extension, as for a file (r6).
  for (const ext of ['', ...WEBPACK_EXTENSIONS])
    if (isFile(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
}

// TypeScript's compiler options for one caller config: Bundler resolution with the config's own
// `allowJs` and `resolveJsonModule`, and only its `@/*` mapping (validated below).
export function typescriptOptions(root, configRel, options) {
  const dir = path.join(root, path.dirname(configRel));
  return {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    allowJs: options.allowJs === true,
    resolveJsonModule: options.resolveJsonModule === true,
    ...(typeof options.baseUrl === 'string' && { baseUrl: path.join(dir, options.baseUrl) }),
    paths: { '@/*': options.paths['@/*'] },
    pathsBasePath: dir,
  };
}

// A module-resolution host confined to the tree: nothing outside it or under `node_modules`.
export function confinedHost(root, isFile) {
  const relOf = abs => {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    return rel.startsWith('..') || path.isAbsolute(rel) || rel.includes('node_modules')
      ? null
      : rel;
  };
  return {
    fileExists: abs => {
      const rel = relOf(abs);
      return rel !== null && isFile(rel);
    },
    readFile: abs => {
      const rel = relOf(abs);
      return rel === null ? undefined : (readInside(root, rel) ?? undefined);
    },
    directoryExists: abs => relOf(abs) !== null,
    realpath: abs => abs,
    getCurrentDirectory: () => root,
  };
}

// The tsconfig options that change resolution and are not modelled: one present is an error.
const UNMODELLED_OPTIONS = Object.freeze([
  // Elision: with these an all-`type` import can stay a runtime load (r4-B2 keeps type edges to
  // TypeScript's pick only).
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
]);

const sha256 = text => createHash('sha256').update(text).digest('hex');
// JSON with sorted object keys, arrays in order: one text per value.
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort(byCodeUnit)
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
};

// Each caller tsconfig's exact `@/*` mapping and the sha256 of its exact `{ baseUrl, paths }`
// value (canonical JSON, `baseUrl` null when absent). Both mappings name `apps/web/src/*`.
const FIXED_TSCONFIGS = Object.freeze({
  'apps/web/tsconfig.json': Object.freeze({
    alias: Object.freeze(['./src/*']),
    paths: '4c212762cc1e69169a276cb959c3abd23cd6206809ff5bc4c5bef64206069f01',
  }),
  'tsconfig.json': Object.freeze({
    alias: Object.freeze(['apps/web/src/*']),
    paths: '1c62a87259683c28e56f4e353fe735e9b80fb798b5ca74277a6bdbd922adba9d',
  }),
});
// The one `@/*` pattern, repo-relative, that both fixed mappings resolve to.
export const ALIAS_PATTERN = 'apps/web/src/*';

// A caller tsconfig the resolver can model: no inheritance, Bundler resolution, none of the
// unmodelled options, today's exact `@/*` mapping and today's exact `paths` and `baseUrl`.
export function validateResolutionConfig(config, configRel) {
  if (config?.extends !== undefined)
    refuse(`${configRel} uses extends, which the resolver does not model`);
  const options = config?.compilerOptions ?? {};
  for (const option of UNMODELLED_OPTIONS)
    if (options[option] !== undefined)
      refuse(`${configRel} sets ${option}, which the resolver does not model`);
  const resolution = options.moduleResolution;
  if (typeof resolution !== 'string' || resolution.toLowerCase() !== 'bundler')
    refuse(`${configRel} moduleResolution is not bundler`);
  const fixed = FIXED_TSCONFIGS[configRel];
  if (canonical(options.paths?.['@/*'] ?? null) !== canonical(fixed.alias))
    refuse(`${configRel} has an @/* mapping other than the fixed ${JSON.stringify(fixed.alias)}`);
  const value = { baseUrl: options.baseUrl ?? null, paths: options.paths };
  if (sha256(canonical(value)) !== fixed.paths)
    refuse(`${configRel} has paths or baseUrl other than the fixed configuration's`);
}

// The web app's Next config and the two local files it loads, by sha256 of their exact text. Read
// for this pin (2026-11-23; re-pinned 2026-11-24 by #2124, which changes the config, lead decision):
// none changes webpack's `resolve` or adds a plugin, and the config selects no other tsconfig; it
// imports the four wrappers below, Next's own `next/constants.js` and the two helpers, nothing else.
// #2124 adds the pilot-env manifest check (a phase function returning the same wrapped config) and
// one `env` value; `pilot-env-refusals.mjs` imports nothing. An absent `next.config.mjs` is Next's
// defaults, which D-1 models.
const NEXT_CONFIG = 'apps/web/next.config.mjs';
const FIXED_NEXT_FILES = Object.freeze({
  [NEXT_CONFIG]: 'c340cf96158e00cb74d8959619832e1b28c8067acd1c71e779d2b0d2ff677749',
  'apps/web/src/lib/pilot-env-refusals.mjs':
    '0f4bdf77d750c3ca0b9cac0adc6b679721472d63a0ef3941341d8e144fc8106f',
  'apps/web/src/lib/supabase-deployment.mjs':
    'abb080e7b2a72cf4efba6240fe547a3e31e412b98dee84278dd238d3c3e6f253',
});
const OTHER_NEXT_CONFIGS = Object.freeze(
  ['js', 'cjs', 'ts', 'mts', 'cts'].map(ext => `apps/web/next.config.${ext}`)
);
// The packages the fixed config imports, each reviewed for what it does to webpack's `resolve` at
// one version, unpatched and with one lockfile integrity, as the scanned tree's lockfile resolves
// them for `apps/web`.
// `@next/bundle-analyzer` changes nothing; `@sentry/nextjs` aliases `perf_hooks`; `next-axiom`
// changes nothing; `next-intl` aliases `next-intl/config` and `use-intl/format-message`. All are
// bare package keys, which match no relative or `@/` request (read 2026-11-22).
export const REVIEWED_WRAPPERS = Object.freeze({
  '@next/bundle-analyzer': {
    version: '16.3.5',
    integrity:
      'sha512-EbKlv1DkII5+BGl8qweNtrX+7Ot+QOCsSpUve43W8XsOQz7am0T45pCdm6W3kbBwWtEbIEKNhAknje1gjXyyLw==',
  },
  '@sentry/nextjs': {
    version: '10.75.2',
    integrity:
      'sha512-ilzb3E7Kaskx/RQ355kCkxLxrHBtYS67pe6KO+F/O6s53f5t4sVwz4gE2Mz4ScghDXeKM+ccyB5GMq9dlkQ35A==',
  },
  'next-axiom': {
    version: '1.10.0',
    integrity:
      'sha512-PpwmfOqoa2xWKcGmYb3d5t3R4+/J8C2D00IhJsI3Qk0xxv9tNvGzS/hKKOPNOuUwqM4b/etqu6iGW7tkKvltgA==',
  },
  'next-intl': {
    version: '4.14.5',
    integrity:
      'sha512-9sPJh5ITJbP28HZ5obuFAMC4RwW/mhEvHiGVHXPWL0uRbF2RrjHWz8PcUmLaH2oca79ak2ayQz+uRSALZN9xSw==',
  },
});

// The reviewed wrappers' lockfile records (lockfile.mjs, a YAML parse): version, own patch and
// integrity, each exactly the reviewed one; `patchedDependencies` must not name the wrapper.
function assertWrappers(root) {
  const lock = readInside(root, 'pnpm-lock.yaml');
  if (lock === null) refuse('pnpm-lock.yaml is missing, so the Next wrappers cannot be checked');
  let records;
  try {
    records = wrapperRecords(parseLockfile(lock), Object.keys(REVIEWED_WRAPPERS));
  } catch (error) {
    if (error instanceof ScanError) refuse(error.message);
    throw error;
  }
  for (const [pkg, reviewed] of Object.entries(REVIEWED_WRAPPERS)) {
    const found = records[pkg];
    if (found?.version !== reviewed.version)
      refuse(
        `${NEXT_CONFIG} loads ${pkg} ${found?.version ?? '(absent)'}, not the reviewed ${reviewed.version}`
      );
    if (found.patch !== null || found.patched.length > 0)
      refuse(
        `${NEXT_CONFIG} loads ${pkg} ${reviewed.version} with a pnpm patch, which was not reviewed`
      );
    // r6: the package record itself, not only its version (another tarball at the same version).
    if (found.integrity !== reviewed.integrity)
      refuse(`${NEXT_CONFIG} loads ${pkg} ${reviewed.version} with another lockfile integrity`);
  }
}

// Next's configuration is the fixed one: today's exact `next.config.mjs` and helper, the reviewed
// wrapper versions, unpatched, and no other `next.config` file.
export function assertNextResolution(root) {
  for (const rel of OTHER_NEXT_CONFIGS)
    if (readInside(root, rel) !== null) refuse(`${rel} is not the fixed ${NEXT_CONFIG}`);
  if (readInside(root, NEXT_CONFIG) === null) return;
  for (const [rel, digest] of Object.entries(FIXED_NEXT_FILES)) {
    const text = readInside(root, rel);
    if (text === null) refuse(`${rel} (loaded by ${NEXT_CONFIG}) is missing`);
    if (sha256(text) !== digest) refuse(`${rel} is not the fixed configuration's exact file`);
  }
  assertWrappers(root);
}
