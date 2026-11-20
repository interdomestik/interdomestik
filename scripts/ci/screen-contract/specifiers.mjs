// Import edges and their resolution for the screen-contract rules (WP-05 design §2, §2.2).
// Syntax only: nothing here imports or runs the scanned code.
//
// Named limits (the repository has none of these today; a new one can resolve another file than
// TypeScript does):
// - a relative `./x.js` where both `x.js` and `x.ts` exist: TypeScript takes `x.ts`, this resolver
//   the literal `x.js`;
// - an `@/*` mapping whose pattern has a `..` segment after the `*` (`src/*/../shared`): it is
//   normalized before the `*` is substituted;
// - `.d.json.ts` and other `.d.<ext>.ts` declarations, `types@<version>` conditions,
//   `typesVersions` and a directory's own `package.json`.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import {
  TYPES_EXTENSIONS,
  TYPES_SOURCES,
  environmentsFor,
  resolveEnvironment,
  validateExports,
} from './exports.mjs';
import { roleOf } from './roles.mjs';

const literalOf = node => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0].value.cooked;
  return null;
};

const isTypeOnlyImport = node =>
  node.importKind === 'type' ||
  (node.specifiers.length > 0 &&
    node.specifiers.every(s => s.type === 'ImportSpecifier' && s.importKind === 'type'));

// `export { type A, type B } from 'p'` is type-only like `export type { A, B } from 'p'` (H1).
const isTypeOnlyExport = node =>
  node.exportKind === 'type' ||
  (node.specifiers?.length > 0 && node.specifiers.every(s => s.exportKind === 'type'));

const exportEdge = node =>
  node.source
    ? { specifier: node.source.value, kind: isTypeOnlyExport(node) ? 'type' : 'import', node }
    : null;

// `import('p').T` in a type position (TSImportType): `source` in typescript-eslint 8, `argument`
// (a TSLiteralType) before it.
function importTypeEdge(node) {
  const value = literalOf(node.source ?? node.argument?.literal);
  return value === null ? null : { specifier: value, kind: 'type', node };
}

function requireEdge(node) {
  const value = node.arguments.length === 1 ? literalOf(node.arguments[0]) : null;
  if (node.callee.type === 'Identifier' && node.callee.name === 'require' && value !== null)
    return { specifier: value, kind: 'require', node };
  return null;
}

function importEqualsEdge(node) {
  if (node.moduleReference?.type !== 'TSExternalModuleReference') return null;
  const value = literalOf(node.moduleReference.expression);
  if (value === null) return null;
  return { specifier: value, kind: node.importKind === 'type' ? 'type' : 'require', node };
}

// node type -> the edge a node of that type makes, or null.
const EDGE_OF = {
  ImportDeclaration: node => ({
    specifier: node.source.value,
    kind: isTypeOnlyImport(node) ? 'type' : 'import',
    node,
  }),
  ExportNamedDeclaration: exportEdge,
  ExportAllDeclaration: exportEdge,
  ImportExpression: node => {
    const value = literalOf(node.source);
    return value === null ? null : { specifier: value, kind: 'dynamic', node };
  },
  CallExpression: requireEdge,
  TSImportEqualsDeclaration: importEqualsEdge,
  TSImportType: importTypeEdge,
};

// Every module edge of an ESTree program: static import, `export … from`, literal `import()`,
// literal `require()`, `import x = require()` and `import('p')` types. Kind: import | type |
// dynamic | require.
export function edgesOfProgram(program, visitorKeys) {
  const out = [];
  const visit = node => {
    if (!node || typeof node.type !== 'string') return;
    const edge = Object.hasOwn(EDGE_OF, node.type) ? EDGE_OF[node.type](node) : null;
    if (edge) out.push(edge);
    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(program);
  return out;
}

export function kindOfSpecifier(specifier) {
  if (specifier.startsWith('.')) return 'relative';
  if (specifier.startsWith('@/')) return 'alias';
  if (/^@interdomestik\/[^/]+/u.test(specifier)) return 'workspace';
  return 'external';
}

const EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.jsx',
  '.mjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

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

// The `@/` patterns of one tsconfig: every entry of its `paths['@/*']`, in order, relative to
// `baseUrl` or, without one, to the config's directory, repo-relative (`apps/web/src/*`).
function aliasPatterns(root, configRel) {
  const config = readJson(path.join(root, configRel), configRel, parseTsconfig);
  const options = config?.compilerOptions;
  const mapping = options?.paths?.['@/*'];
  if (mapping === undefined) throw new ScanError(`${configRel} has no @/* mapping`);
  if (!Array.isArray(mapping) || mapping.length === 0 || !mapping.every(isPathsEntry))
    throw new ScanError(`${configRel} has no usable @/* mapping`);
  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : '.';
  const base = path.posix.join(path.posix.dirname(configRel), baseUrl);
  return Object.freeze(mapping.map(entry => path.posix.join(base, entry)));
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

// TypeScript's files for one `paths` candidate (moduleResolution Bundler, allowJs; F7), in its
// order: the candidate itself when the entry names an extension; the candidate with its extension
// replaced; with extensions added; its directory's `index`. Replacing and adding use the row of
// TYPES_SOURCES that TypeScript's tryAddingExtensions shares with the extension (`.ts`, `.d.ts` and
// none try what `.js` tries; `.tsx` what `.jsx`; `.mts`, `.d.mts` what `.mjs`; `.cts`, `.d.cts`
// what `.cjs`), both passes in one: Bundler resolves typed and JavaScript files in one pass, so the
// first entry that names a file wins. An unknown extension's `.d<ext>.ts` is not modelled.
const ROW_OF_EXTENSION = Object.freeze({
  '': '.js',
  '.ts': '.js',
  '.d.ts': '.js',
  '.tsx': '.jsx',
  '.mts': '.mjs',
  '.d.mts': '.mjs',
  '.cts': '.cjs',
  '.d.cts': '.cjs',
});
const extensionOf = file => TYPES_EXTENSIONS.find(ext => file.endsWith(ext)) ?? null;
const sourcesOf = ext => TYPES_SOURCES[ROW_OF_EXTENSION[ext] ?? ext].flat();

function aliasCandidates(entry, candidate) {
  const out = extensionOf(entry) ? [candidate] : [];
  const ext = extensionOf(candidate);
  if (ext) {
    const stem = candidate.slice(0, candidate.length - ext.length);
    out.push(...sourcesOf(ext).map(source => stem + source));
  }
  const added = sourcesOf('');
  out.push(
    ...added.map(source => candidate + source),
    ...added.map(source => `${candidate}/index${source}`)
  );
  return out;
}

const packageDirOf = rel => /^(packages\/[^/]+)\//u.exec(rel)?.[1] ?? null;

const resolvers = new Map();

// One resolver per target tree, cached for the life of the process (one lint run).
export function resolverFor(root) {
  if (resolvers.has(root)) return resolvers.get(root);
  const alias = Object.fromEntries(
    Object.entries(ALIAS_CONFIGS).map(([caller, configRel]) => [
      caller,
      aliasPatterns(root, configRel),
    ])
  );
  const packages = workspacePackages(root);
  const existing = new Map();
  const isFile = rel => {
    if (!existing.has(rel)) {
      const abs = path.join(root, rel);
      existing.set(rel, fs.existsSync(abs) && fs.statSync(abs).isFile());
    }
    return existing.get(rel);
  };
  const firstFile = candidates => {
    for (const candidate of candidates) {
      const rel = path.posix.normalize(candidate);
      if (!rel.startsWith('..') && isFile(rel)) return rel;
    }
    return null;
  };
  const firstExisting = base => {
    const candidates = [...EXTENSIONS.map(ext => base + ext)];
    // TypeScript's ESM style: `./x.js` names `./x.ts`.
    if (/\.(m?js|jsx)$/u.test(base)) {
      const stem = base.replace(/\.(m?js|jsx)$/u, '');
      candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`);
    }
    return firstFile(candidates);
  };
  const workspace = specifier => {
    const match = /^(@interdomestik\/[^/]+)(\/.*)?$/u.exec(specifier);
    if (!match) return null;
    return { name: match[1], subpath: `.${match[2] ?? ''}`, entry: packages.get(match[1]) ?? null };
  };
  // TypeScript's `paths`: each entry in order, its `*` (if any) replaced, and the first that names
  // a file wins (B8), in TypeScript's file order (F7).
  const aliasFile = (patterns, rest) => {
    for (const pattern of patterns) {
      const candidate = pattern.replace('*', () => rest);
      const file = firstFile(aliasCandidates(pattern, candidate));
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
  // found). A relative or `@/` path names one file; `@/` follows the caller's tsconfig.
  const resolveTargets = (fromRel, specifier, edgeKind = 'import') => {
    const kind = kindOfSpecifier(specifier);
    if (kind === 'workspace') return workspaceFiles(specifier, edgeKind);
    let file = null;
    if (kind === 'relative')
      file = firstExisting(path.posix.join(path.posix.dirname(fromRel), specifier));
    else if (kind === 'alias') file = aliasFile(alias[aliasConfigOf(fromRel)], specifier.slice(2));
    return file ? [file] : [];
  };
  // The first of those files, or null.
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
