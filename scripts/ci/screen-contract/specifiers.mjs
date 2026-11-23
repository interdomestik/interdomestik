// Import edges and their resolution for the screen-contract rules (WP-05 design §2, §2.2).
// Syntax only: nothing here imports or runs the scanned code.
//
// A relative or `@/` request names the file TypeScript selects and the file Next's webpack build
// selects (the WP-05 flip, D-1: resolution.mjs). Named limits: `types@<version>` conditions and
// `typesVersions` of workspace packages are not modelled.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { environmentsFor, resolveEnvironment, validateExports } from './exports.mjs';
import {
  assertNextResolution,
  confinedHost,
  typescriptOptions,
  validateResolutionConfig,
  webpackPick,
} from './resolution.mjs';
import { roleOf } from './roles.mjs';
import { kindOfSpecifier } from './specifiers-edges.mjs';

export { edgesOfProgram, kindOfSpecifier } from './specifiers-edges.mjs';

function readJson(file, label, parse = JSON.parse) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new ScanError(`${label} is missing`);
  }
  if (!text.trim()) throw new ScanError(`${label} is empty`);
  try {
    return parse(text);
  } catch {
    throw new ScanError(`${label} is not parseable`);
  }
}

function parseTsconfig(text) {
  const { config, error } = ts.parseConfigFileTextToJson('tsconfig.json', text);
  if (error) throw new Error('unparseable');
  return config;
}

// A `paths` entry TypeScript accepts: a string with at most one `*`. One without `*` is a fixed
// file every specifier the key matches maps to (F7).
const isPathsEntry = entry =>
  typeof entry === 'string' && entry.indexOf('*') === entry.lastIndexOf('*');

// One caller tsconfig: its `@/` patterns (every entry of `paths['@/*']`, in order, relative to
// `baseUrl` or, without one, to the config's directory, repo-relative: `apps/web/src/*`) and the
// compiler options TypeScript resolves its requests with.
function callerConfig(root, configRel) {
  const config = readJson(path.join(root, configRel), configRel, parseTsconfig);
  validateResolutionConfig(config, configRel);
  const options = config?.compilerOptions;
  const mapping = options?.paths?.['@/*'];
  if (mapping === undefined) throw new ScanError(`${configRel} has no @/* mapping`);
  if (!Array.isArray(mapping) || mapping.length === 0 || !mapping.every(isPathsEntry))
    throw new ScanError(`${configRel} has no usable @/* mapping`);
  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : '.';
  const base = path.posix.join(path.posix.dirname(configRel), baseUrl);
  return Object.freeze({
    patterns: Object.freeze(mapping.map(entry => path.posix.join(base, entry))),
    tsOptions: typescriptOptions(root, configRel, options),
  });
}

// The tsconfig that compiles each caller (H7): the web app's for `apps/web/**`; the root one for
// `packages/**`, which the root config includes and the packages that extend it inherit (today
// both name `apps/web/src`).
const ALIAS_CONFIGS = Object.freeze({ web: 'apps/web/tsconfig.json', root: 'tsconfig.json' });
const aliasConfigOf = fromRel => (fromRel.startsWith('apps/web/') ? 'web' : 'root');

// The environments whose file an edge loads (B5): a value edge its value conditions, a type edge
// the types condition.
const resolutionEnvironments = edgeKind =>
  edgeKind === 'type' ? ['types'] : environmentsFor(edgeKind).filter(env => env !== 'types');

// Workspace packages of the target tree: name -> { dir, pkg }.
function workspacePackages(root) {
  const out = new Map();
  const dir = path.join(root, 'packages');
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort(byCodeUnit)) {
    const file = path.join(dir, name, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = readJson(file, `packages/${name}/package.json`);
    if (typeof pkg?.name !== 'string')
      throw new ScanError(`packages/${name}/package.json has no name`);
    validateExports(pkg, `packages/${name}/package.json`);
    out.set(pkg.name, { dir: `packages/${name}`, pkg });
  }
  return out;
}

const packageDirOf = rel => /^(packages\/[^/]+)\//u.exec(rel)?.[1] ?? null;

const resolvers = new Map();

// One resolver per target tree, cached for the life of the process (one lint run).
export function resolverFor(root) {
  if (resolvers.has(root)) return resolvers.get(root);
  const callers = Object.fromEntries(
    Object.entries(ALIAS_CONFIGS).map(([caller, configRel]) => [
      caller,
      callerConfig(root, configRel),
    ])
  );
  const alias = Object.fromEntries(
    Object.entries(callers).map(([caller, config]) => [caller, config.patterns])
  );
  assertNextResolution(root);
  const packages = workspacePackages(root);
  const existing = new Map();
  const isFile = rel => {
    if (!existing.has(rel)) {
      const abs = path.join(root, rel);
      existing.set(rel, fs.existsSync(abs) && fs.statSync(abs).isFile());
    }
    return existing.get(rel);
  };
  const host = confinedHost(root, isFile);
  const caches = Object.fromEntries(
    Object.entries(callers).map(([caller, config]) => [
      caller,
      ts.createModuleResolutionCache(root, name => name, config.tsOptions),
    ])
  );
  const workspace = specifier => {
    const match = /^(@interdomestik\/[^/]+)(\/.*)?$/u.exec(specifier);
    if (!match) return null;
    return { name: match[1], subpath: `.${match[2] ?? ''}`, entry: packages.get(match[1]) ?? null };
  };
  // TypeScript's pick for a relative or `@/` request (D-1, r3-B2): `ts.resolveModuleName` with the
  // caller's options on a host confined to the tree; a file outside it is no target.
  const typescriptTarget = (fromRel, specifier) => {
    const caller = aliasConfigOf(fromRel);
    const { resolvedModule } = ts.resolveModuleName(
      specifier,
      path.join(root, fromRel),
      callers[caller].tsOptions,
      host,
      caches[caller]
    );
    if (!resolvedModule || resolvedModule.isExternalLibraryImport) return null;
    const rel = toRel(root, resolvedModule.resolvedFileName);
    return rel.startsWith('..') || !isFile(rel) ? null : rel;
  };
  const inTree = rel => (rel.startsWith('..') ? null : rel);
  // Webpack's pick (resolution.mjs): relative to the caller, or for `@/` each `paths['@/*']` entry
  // in order, its `*` (if any) replaced, the first that names a file winning (B8, F7), as Next's
  // JsConfigPathsPlugin applies them. Next installs one paths plugin for the whole build, from the
  // web app's tsconfig, so every caller, `packages/**` included, uses the web app's mapping
  // (r4-S2b). A substitution that ends in `.d.ts` is passed over, as the plugin does (r4-S1).
  const webpackTarget = (fromRel, specifier) => {
    if (kindOfSpecifier(specifier) === 'relative') {
      const base = inTree(
        path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier))
      );
      return base && webpackPick(isFile, base);
    }
    const rest = specifier.slice(2);
    for (const pattern of alias.web) {
      const star = pattern.indexOf('*');
      const substituted =
        star === -1 ? pattern : `${pattern.slice(0, star)}${rest}${pattern.slice(star + 1)}`;
      if (substituted.endsWith('.d.ts')) continue;
      const candidate = inTree(path.posix.normalize(substituted));
      const file = candidate && webpackPick(isFile, candidate);
      if (file) return file;
    }
    return null;
  };
  // A file check for `exports` targets ('./src/x.ts') of the package in `dir`.
  const existsIn = dir => target => isFile(path.posix.join(dir, target));
  // The files a workspace edge loads, one per environment of its kind, without duplicates.
  const workspaceFiles = (specifier, edgeKind) => {
    const target = workspace(specifier);
    if (!target?.entry) return [];
    const { dir, pkg } = target.entry;
    const files = new Set();
    for (const env of resolutionEnvironments(edgeKind)) {
      const result = resolveEnvironment(pkg, target.subpath, env, existsIn(dir));
      if (result.status === 'resolved' && result.target)
        files.add(path.posix.join(dir, result.target));
    }
    return [...files];
  };
  // The repo-relative files a specifier names for an edge of `edgeKind` (empty: external, or not
  // found). A relative or `@/` path names TypeScript's pick and webpack's pick, deduplicated (D-1);
  // `@/` follows the caller's tsconfig.
  const resolveTargets = (fromRel, specifier, edgeKind = 'import') => {
    const kind = kindOfSpecifier(specifier);
    if (kind === 'workspace') return workspaceFiles(specifier, edgeKind);
    if (kind !== 'relative' && kind !== 'alias') return [];
    // A type-only edge is erased: TypeScript reads it, webpack never loads it (r4-B2).
    if (edgeKind === 'type') return [typescriptTarget(fromRel, specifier)].filter(Boolean);
    const picks = [typescriptTarget(fromRel, specifier), webpackTarget(fromRel, specifier)];
    return [...new Set(picks.filter(Boolean))];
  };
  // The first of those files (TypeScript's pick, else webpack's, for a relative or `@/` path), or
  // null.
  const resolveFile = (fromRel, specifier, edgeKind = 'import') =>
    resolveTargets(fromRel, specifier, edgeKind)[0] ?? null;
  const resolver = {
    root,
    alias,
    packages,
    workspace,
    resolveTargets,
    resolveFile,
    existsIn,
    packageDirOf,
    isFile,
  };
  resolvers.set(root, resolver);
  return resolver;
}

export const toRel = (root, filename) => path.relative(root, filename).split(path.sep).join('/');

// The layer of a resolved workspace package that has no resolvable file: its directory's role.
export const packageRole = dir => roleOf(`${dir}/src/index.ts`);
