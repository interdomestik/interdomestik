// What a relative or `@/` request loads (the WP-05 flip, D-1; r1-B4, r2-B3, r3-B2/B3). Its targets
// are the file each tool selects, never a guess: TypeScript's own pick (`ts.resolveModuleName`,
// moduleResolution Bundler, with the caller's options) and webpack's pick as Next's production
// build (`next build --webpack`) configures it. Both picks are judged, deduplicated, and reported
// once per edge. An exact asset (`x.module.css`) is webpack's pick.
//
// Webpack's order (`WEBPACK_EXTENSIONS`, read from Next's `webpack-config.js` and pinned by a test
// against the installed Next): the request itself, then the request with each extension, then a
// directory's `index` with each extension; a directory with its own `package.json` is an error
// (webpack's `mainFields` are not modelled). `@/` requests try each `paths['@/*']` entry in order, as
// Next's JsConfigPathsPlugin and TypeScript do.
//
// Relied on from Next's configuration, checked statically (`assertNextResolution`): `next.config`
// and the local files it imports do not change webpack's `resolve` or add plugins, except by
// aliasing a bare package name, which cannot match a relative or `@/` request; every package it
// imports is a reviewed wrapper or a Node builtin. Next's own aliases (`create-compiler-aliases.js`)
// and per-rule `resolve` blocks name packages only (read at 16.4.1). Named limits: a later version
// of a reviewed wrapper, or of Next, that aliases a relative or `@/` key or changes the extension
// list (the test pins the list against the installed Next).
import { isBuiltin } from 'node:module';
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
    throw new ScanError(`${base} is a directory with its own package.json (not modelled)`);
  for (const ext of WEBPACK_EXTENSIONS)
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
    return rel.startsWith('..') || path.isAbsolute(rel) || rel.includes('node_modules') ? null : rel;
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
  'rootDirs',
  'moduleSuffixes',
  'customConditions',
  'allowArbitraryExtensions',
  'resolvePackageJsonExports',
  'resolvePackageJsonImports',
  'typeRoots',
]);
// A `paths` key other than `@/*` must be a workspace package name, which cannot match a relative
// or `@/` request; workspace edges resolve through `exports` (WP-05 design §2.2).
const WORKSPACE_KEY_RE = /^@interdomestik\/[a-z0-9-]+(?:\/\*)?$/u;

// A caller tsconfig the resolver can model (r2-B3): no inheritance, Bundler resolution, none of the
// unmodelled options, and no `paths` key that could match a relative or `@/` request.
export function validateResolutionConfig(config, configRel) {
  if (config?.extends !== undefined)
    throw new ScanError(`${configRel} uses extends, which the resolver does not model`);
  const options = config?.compilerOptions ?? {};
  for (const option of UNMODELLED_OPTIONS)
    if (options[option] !== undefined)
      throw new ScanError(`${configRel} sets ${option}, which the resolver does not model`);
  const resolution = options.moduleResolution;
  if (typeof resolution !== 'string' || resolution.toLowerCase() !== 'bundler')
    throw new ScanError(`${configRel} moduleResolution is not bundler`);
  for (const key of Object.keys(options.paths ?? {}))
    if (key !== '@/*' && !WORKSPACE_KEY_RE.test(key))
      throw new ScanError(
        `${configRel} has the paths key ${key}, which the resolver does not model`
      );
}

const NEXT_CONFIGS = Object.freeze(['js', 'mjs', 'cjs', 'ts', 'mts'].map(e => `next.config.${e}`));
// The packages `next.config` may import, each reviewed for what it does to webpack's `resolve`
// (2026-11-22, installed versions): `@next/bundle-analyzer` 16.3.5 nothing; `@sentry/nextjs`
// 10.75.2 aliases `perf_hooks`; `next-axiom` 1.10.0 nothing; `next-intl/plugin` 4.14.5 aliases
// `next-intl/config` and `use-intl/format-message`. All bare package names (r3-B3).
const REVIEWED_WRAPPERS = Object.freeze([
  '@next/bundle-analyzer',
  '@sentry/nextjs',
  'next-axiom',
  'next-intl/plugin',
]);
// What `resolve.alias` may be given: a literal key naming a bare package, which can match no
// relative (`.`, `/`) or `@/` request.
const isBareKey = key => /^(?:@[^/]+\/)?[^./@][^/]*(?:\/.*)?$/u.test(key) && !key.startsWith('@/');

const isName = (node, text) =>
  (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && node.text === text;
// `<x>.resolve(…)`: a call such as `path.resolve` or `require.resolve`, not webpack's settings.
const isResolveCall = node =>
  ts.isPropertyAccessExpression(node.parent) &&
  node.parent.name === node &&
  ts.isCallExpression(node.parent.parent) &&
  node.parent.parent.expression === node.parent;
// `<x>.resolve.alias[<literal>]` with a bare package key (Sentry's `perf_hooks`, next-intl's).
function isBareAliasKey(node) {
  const access = node.parent;
  if (!ts.isPropertyAccessExpression(access) || access.name !== node) return false;
  const alias = access.parent;
  if (!ts.isPropertyAccessExpression(alias) || alias.expression !== access) return false;
  if (alias.name.text !== 'alias') return false;
  const entry = alias.parent;
  return (
    ts.isElementAccessExpression(entry) &&
    entry.expression === alias &&
    ts.isStringLiteralLike(entry.argumentExpression) &&
    isBareKey(entry.argumentExpression.text)
  );
}

// The text of a node that can change webpack's resolution, or null (r3-B3). Fail closed on the
// name: every `extensionAlias` or `plugins` (a resolver or replacement plugin), and every
// `resolve` (a member, a property, a destructured or computed name) except a `….resolve(…)` call
// and `….resolve.alias[<bare literal>]`.
function resolutionChange(node, source) {
  if (isName(node, 'extensionAlias') || isName(node, 'plugins'))
    return node.parent.getText(source);
  if (!isName(node, 'resolve') || isResolveCall(node) || isBareAliasKey(node)) return null;
  return node.parent.getText(source);
}

// The module specifiers a config file imports (static imports and `require` of a literal).
function importsOf(source) {
  const out = [];
  const visit = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
      out.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      out.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function checkConfigFile(root, rel, seen) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const text = readInside(root, rel);
  if (text === null) throw new ScanError(`${rel} (imported by next.config) is missing`);
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = null;
  const visit = node => {
    found ??= resolutionChange(node, source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (found)
    throw new ScanError(`${rel} changes webpack resolution (${found}), which D-1 does not model`);
  for (const specifier of importsOf(source)) {
    if (specifier.startsWith('.'))
      checkConfigFile(root, path.posix.normalize(path.posix.join(path.posix.dirname(rel), specifier)), seen);
    else if (!isBuiltin(specifier) && !REVIEWED_WRAPPERS.includes(specifier))
      throw new ScanError(`${rel} imports ${specifier}, which is not a reviewed Next wrapper`);
  }
}

// The web app's Next config, and the local files it imports, leave webpack's resolution of relative
// and `@/` requests as D-1 models it.
export function assertNextResolution(root) {
  const seen = new Set();
  for (const name of NEXT_CONFIGS) {
    const rel = `apps/web/${name}`;
    if (readInside(root, rel) !== null) checkConfigFile(root, rel, seen);
  }
}
