// Import edges and their resolution for the screen-contract rules (WP-05 design §2, §2.2).
// Syntax only: nothing here imports or runs the scanned code.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { environmentsFor, resolveEnvironment, validateExports } from './exports.mjs';
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

// The `@/` target directory of one tsconfig (its `paths['@/*']`, relative to `baseUrl` or, without
// one, to the config's directory), repo-relative.
function aliasRoot(root, configRel) {
  const config = readJson(path.join(root, configRel), configRel, parseTsconfig);
  const options = config?.compilerOptions;
  const mapping = options?.paths?.['@/*'];
  if (!Array.isArray(mapping) || typeof mapping[0] !== 'string' || !mapping[0].endsWith('/*'))
    throw new ScanError(`${configRel} has no @/* mapping`);
  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : '.';
  const base = path.posix.join(path.posix.dirname(configRel), baseUrl);
  return path.posix.normalize(path.posix.join(base, mapping[0].slice(0, -2)));
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
  const alias = Object.fromEntries(
    Object.entries(ALIAS_CONFIGS).map(([caller, configRel]) => [caller, aliasRoot(root, configRel)])
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
  const firstExisting = base => {
    const candidates = [...EXTENSIONS.map(ext => base + ext)];
    // TypeScript's ESM style: `./x.js` names `./x.ts`.
    if (/\.(m?js|jsx)$/u.test(base)) {
      const stem = base.replace(/\.(m?js|jsx)$/u, '');
      candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`);
    }
    for (const candidate of candidates) {
      const rel = path.posix.normalize(candidate);
      if (!rel.startsWith('..') && isFile(rel)) return rel;
    }
    return null;
  };
  const workspace = specifier => {
    const match = /^(@interdomestik\/[^/]+)(\/.*)?$/u.exec(specifier);
    if (!match) return null;
    return { name: match[1], subpath: `.${match[2] ?? ''}`, entry: packages.get(match[1]) ?? null };
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
    else if (kind === 'alias')
      file = firstExisting(path.posix.join(alias[aliasConfigOf(fromRel)], specifier.slice(2)));
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
