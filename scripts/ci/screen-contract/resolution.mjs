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
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { ScanError } from '../server-mutation/ast.mjs';
import { readInside } from './paths.mjs';

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

// The fixed configuration (the owner's decision B, 2026-11-23): the scanner models the build for
// one reviewed configuration and refuses every other. Each refusal names its reason and that a
// change needs a scanner PR first, which reviews the new configuration and updates the pin here.
const SCANNER_PR = 'a change to it needs a scanner PR first (WP-05 flip, D-1 fixed configuration)';
const refuse = what => {
  throw new ScanError(`${what}; ${SCANNER_PR}`);
};
const sha256 = text => createHash('sha256').update(text).digest('hex');
// JSON with sorted object keys, arrays in order: one text per value.
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
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

// The web app's Next config and the one local file it loads, by sha256 of their exact text. Read
// for this pin (2026-11-23): neither changes webpack's `resolve` or adds a plugin, and the config
// selects no other tsconfig; it imports the four wrappers below and the helper, nothing else. An
// absent `next.config.mjs` is Next's defaults, which D-1 models.
const NEXT_CONFIG = 'apps/web/next.config.mjs';
const FIXED_NEXT_FILES = Object.freeze({
  [NEXT_CONFIG]: 'a26096d3b440844ebd8f7a33f65f4953c24f6d2a56b2480d654290e0add10b39',
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
const REVIEWED_WRAPPERS = Object.freeze({
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

// The integrity of each package record of the lockfile (pnpm's `packages:`), by `<name>@<version>`.
export function packageIntegrities(text) {
  const out = {};
  let inside = false;
  let current = null;
  for (const line of text.split('\n')) {
    if (/^\S/u.test(line)) {
      inside = line.trim() === 'packages:';
      current = null;
      continue;
    }
    if (!inside) continue;
    const key = /^ {2}'?([^'\s][^']*?)'?:\s*$/u.exec(line);
    if (key) current = key[1];
    const integrity = /integrity: ([^,\s}]+)/u.exec(line);
    if (integrity && current && out[current] === undefined) out[current] = integrity[1];
  }
  return out;
}

// The lockfile entry each direct dependency of `apps/web` resolves to (pnpm's `importers`): its
// version and its own `patch_hash`, if pnpm patched it (the group right after the version; later
// groups are peers, which may carry their own).
export function webDependencyVersions(text) {
  const out = {};
  let section = null;
  let current = null;
  for (const line of text.split('\n')) {
    if (/^\S/u.test(line)) section = line.trim() === 'importers:' ? 'importers' : null;
    if (section === null) continue;
    const importer = /^ {2}(\S[^:]*):\s*$/u.exec(line);
    if (importer) {
      section = importer[1] === 'apps/web' ? 'web' : 'importers';
      current = null;
      continue;
    }
    if (section !== 'web') continue;
    const dep = /^ {6}'?([^':\s]+)'?:\s*$/u.exec(line);
    if (dep) current = dep[1];
    const version = /^ {8}version: ([^(\s]+)(\(patch_hash=([^)]*)\))?/u.exec(line);
    if (version && current) out[current] = { version: version[1], patch: version[3] ?? null };
  }
  return out;
}

// A wrapper the lockfile's `patchedDependencies` names is patched, whatever its version line says.
const patchedPackages = text => {
  const out = new Set();
  let inside = false;
  for (const line of text.split('\n')) {
    if (/^\S/u.test(line)) inside = line.trim() === 'patchedDependencies:';
    const entry = inside && /^ {2}'?((?:@[^/@\s]+\/)?[^@'\s]+)@/u.exec(line);
    if (entry) out.add(entry[1]);
  }
  return out;
};

function assertWrappers(root) {
  const lock = readInside(root, 'pnpm-lock.yaml');
  if (lock === null) refuse('pnpm-lock.yaml is missing, so the Next wrappers cannot be checked');
  const versions = webDependencyVersions(lock);
  const patched = patchedPackages(lock);
  const integrities = packageIntegrities(lock);
  for (const [pkg, reviewed] of Object.entries(REVIEWED_WRAPPERS)) {
    const found = versions[pkg];
    if (found?.version !== reviewed.version)
      refuse(
        `${NEXT_CONFIG} loads ${pkg} ${found?.version ?? '(absent)'}, not the reviewed ${reviewed.version}`
      );
    if (found.patch !== null || patched.has(pkg))
      refuse(
        `${NEXT_CONFIG} loads ${pkg} ${reviewed.version} with a pnpm patch, which was not reviewed`
      );
    // r6: the package record itself, not only its version (another tarball at the same version).
    if (integrities[`${pkg}@${reviewed.version}`] !== reviewed.integrity)
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

// Request forms D-1 does not model, refused wherever an edge is classified (`kindOfSpecifier`):
// an absolute or server-relative path (webpack's `roots`), an inline loader (`!`), a package import
// (`#…`, a `package.json` `imports` map), a URL scheme other than `node:` (webpack's `file:` and
// `data:`), and Next's built-in aliases that point into the app (`private-next-root-dir`,
// `private-next-app-dir`, `private-next-pages`, `private-dot-next`, the `private-next-rsc-…` and
// `private-next-instrumentation-…` keys; `create-compiler-aliases.js`). None occurs on today's tree.
const UNMODELLED_REQUEST = /^(?:\/|#|private-(?:next|dot-next))|!|^(?!node:)[a-z][a-z0-9+.-]*:/iu;
export function assertModelledRequest(specifier) {
  if (UNMODELLED_REQUEST.test(specifier))
    refuse(`the request ${specifier} is a form D-1 does not model`);
}

// Module requests that are not a literal specifier (webpack builds a context module, or loads a
// file by URL, or the request escapes the bundler): a non-literal `import()` or `require()`, any
// other use of `require` (`require.context`, `require.resolve`, `require.ensure`, a bare
// `require`), AMD `define(…)`, `createRequire(…)`, `import.meta.<x>` other than `url`, and
// `new X(…, import.meta.url)` (an asset or worker). Only the reviewed occurrences below, by file
// and exact source text, are accepted; each loads no source file of a layer (message catalogues,
// test helpers, and Node-only database tooling), and none yields a target.
const REVIEWED_DYNAMIC_REQUESTS = Object.freeze({
  'apps/web/src/app/[locale]/_core.entry.tsx': ['import(`@/messages/${locale}/metadata.json`)'],
  'apps/web/src/i18n/messages.ts': [
    'import(`../messages/${locale}/${namespace}.json`)',
    'import(`../messages/${routing.defaultLocale}/${namespace}.json`)',
  ],
  'apps/web/src/features/help-now/sw-test-utils.ts': [
    'import(OFFLINE_HELPER_MODULE)',
    'import(WORKER_MODULE)',
  ],
  'packages/database/src/migration-callback-source-verifier.ts': [
    'createRequire(import.meta.url)',
    'import.meta.resolve',
    'import(url)',
  ],
  'packages/database/src/migration-corpus-root.ts': ["new URL('../drizzle/', import.meta.url)"],
  'packages/domain-communications/src/messages/public-reply-concurrency.runtime-fixture.ts': [
    "new URL('../../../../node_modules/tsx/dist/loader.mjs', import.meta.url)",
    "new URL('./public-reply-concurrency-worker.test-support.ts', import.meta.url)",
  ],
});
export function assertReviewedDynamicRequest(rel, text) {
  if (!(REVIEWED_DYNAMIC_REQUESTS[rel] ?? []).includes(text))
    refuse(`${rel ?? 'a file'} loads a module by ${text}, a request D-1 does not model`);
}

// A `browser` field in any `package.json` of the tree: the client build's `aliasFields` can remap a
// relative request inside that package to another file. None has one today. `node_modules` and
// build output are not the scanned tree's sources.
const SKIPPED_DIRS = new Set(['node_modules', '.git', '.next', '.turbo']);
export function assertDescriptionFiles(root) {
  const visit = rel => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) visit(child);
      else if (entry.isFile() && entry.name === 'package.json') {
        let data;
        try {
          data = JSON.parse(fs.readFileSync(path.join(root, child), 'utf8'));
        } catch {
          throw new ScanError(`${child} is not parseable`);
        }
        if (data && typeof data === 'object' && Object.hasOwn(data, 'browser'))
          refuse(`${child} has a browser field, which the client build applies to its requests`);
      }
    }
  };
  visit('');
}

// A relative or `@/` request with a query or fragment (`?raw`, `#x`): webpack loads the path part
// through whatever loader the query selects, which D-1 does not model. Only the reviewed edges
// below are accepted, and they name the path part's file; every other one is refused. Both load
// `public/offline.html` as text (a test, and the help-now service-worker test helper).
const REVIEWED_QUERY_EDGES = Object.freeze({
  'apps/web/src/features/help-now/sw-test-utils.ts': '../../../public/offline.html?raw',
  'apps/web/src/lib/pwa/pwa-i18n-contract.test.ts': '../../../public/offline.html?raw',
});
// The request webpack resolves: the specifier, or the path part of a reviewed query edge. A relative
// or `@/` request through a `node_modules` directory (a pnpm workspace link, r6) is refused: the
// scanned tree has no links, and the build would follow one into tracked source.
export function requestPath(fromRel, specifier) {
  if (specifier.split(/[/?#]/u).includes('node_modules'))
    refuse(`${fromRel} imports ${specifier}, a request through node_modules`);
  const cut = specifier.search(/[?#]/u);
  if (cut === -1) return specifier;
  if (REVIEWED_QUERY_EDGES[fromRel] !== specifier)
    refuse(`${fromRel} imports ${specifier}, a request with a query or fragment`);
  return specifier.slice(0, cut);
}
