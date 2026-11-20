// Import edges and their resolution for the screen-contract rules (WP-05 design §2, §2.2).
// Syntax only: nothing here imports or runs the scanned code.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { ScanError } from '../server-mutation/ast.mjs';
import { ENVIRONMENTS, resolveExports, validateExports } from './exports.mjs';
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

// Every module edge of an ESTree program: static import, `export … from`, literal `import()`,
// literal `require()` and `import x = require()`. Kind: import | type | dynamic | require.
export function edgesOfProgram(program, visitorKeys) {
  const out = [];
  const visit = node => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'ImportDeclaration':
        out.push({
          specifier: node.source.value,
          kind: isTypeOnlyImport(node) ? 'type' : 'import',
          node,
        });
        break;
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (node.source)
          out.push({
            specifier: node.source.value,
            kind: node.exportKind === 'type' ? 'type' : 'import',
            node,
          });
        break;
      case 'ImportExpression': {
        const value = literalOf(node.source);
        if (value !== null) out.push({ specifier: value, kind: 'dynamic', node });
        break;
      }
      case 'CallExpression': {
        const value = node.arguments.length === 1 ? literalOf(node.arguments[0]) : null;
        if (node.callee.type === 'Identifier' && node.callee.name === 'require' && value !== null)
          out.push({ specifier: value, kind: 'require', node });
        break;
      }
      case 'TSImportEqualsDeclaration':
        if (node.moduleReference?.type === 'TSExternalModuleReference') {
          const value = literalOf(node.moduleReference.expression);
          if (value !== null)
            out.push({
              specifier: value,
              kind: node.importKind === 'type' ? 'type' : 'require',
              node,
            });
        }
        break;
      default:
        break;
    }
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

// The `@/` target directory of the web app (its tsconfig `paths['@/*']`), repo-relative.
function aliasRoot(root) {
  const config = readJson(
    path.join(root, 'apps/web/tsconfig.json'),
    'apps/web/tsconfig.json',
    parseTsconfig
  );
  const mapping = config?.compilerOptions?.paths?.['@/*'];
  if (!Array.isArray(mapping) || typeof mapping[0] !== 'string' || !mapping[0].endsWith('/*'))
    throw new ScanError('apps/web/tsconfig.json has no @/* mapping');
  return path.posix.normalize(path.posix.join('apps/web', mapping[0].slice(0, -2)));
}

// Workspace packages of the target tree: name -> { dir, pkg }.
function workspacePackages(root) {
  const out = new Map();
  const dir = path.join(root, 'packages');
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
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
  const alias = aliasRoot(root);
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
  // The repo-relative file a specifier names, or null (external, or not found).
  const resolveFile = (fromRel, specifier) => {
    const kind = kindOfSpecifier(specifier);
    if (kind === 'relative')
      return firstExisting(path.posix.join(path.posix.dirname(fromRel), specifier));
    if (kind === 'alias') return firstExisting(path.posix.join(alias, specifier.slice(2)));
    if (kind !== 'workspace') return null;
    const target = workspace(specifier);
    if (!target?.entry) return null;
    for (const env of ['types', 'node-import']) {
      const result = resolveExports(target.entry.pkg, target.subpath, ENVIRONMENTS[env]);
      if (result.status === 'resolved' && result.target)
        return firstExisting(path.posix.join(target.entry.dir, result.target));
    }
    return null;
  };
  const resolver = { root, alias, packages, workspace, resolveFile, packageDirOf, isFile };
  resolvers.set(root, resolver);
  return resolver;
}

export const toRel = (root, filename) => path.relative(root, filename).split(path.sep).join('/');

// The layer of a resolved workspace package that has no resolvable file: its directory's role.
export const packageRole = dir => roleOf(`${dir}/src/index.ts`);
