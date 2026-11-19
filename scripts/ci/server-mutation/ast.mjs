// Shared, syntax-only helpers of the server-mutation checks (WP-02 part 1, design §6).
// Everything here reads a source tree on disk; nothing imports or runs the scanned code.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export class ScanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScanError';
  }
}

export const sha256 = text => createHash('sha256').update(text).digest('hex');
export const shortHash = text => sha256(text).slice(0, 12);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage']);
const SOURCE_RE = /\.(ts|tsx|mts|cts)$/u;

// The default sort order (UTF-16 code units), written out.
export const byCodeUnit = (a, b) => Number(a > b) - Number(a < b);

export function listSourceFiles(root, prefixes) {
  const out = [];
  const walk = rel => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (SOURCE_RE.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(child);
    }
  };
  for (const prefix of prefixes) walk(prefix);
  return out.sort(byCodeUnit);
}

export function scanRoots(root) {
  const roots = ['apps/web/src'];
  const packages = path.join(root, 'packages');
  if (fs.existsSync(packages))
    for (const name of fs.readdirSync(packages).sort(byCodeUnit))
      if (fs.existsSync(path.join(packages, name, 'src'))) roots.push(`packages/${name}/src`);
  return roots;
}

// Tests and test support; e2e route handlers under app/ are production code and stay scanned.
const TEST_RE =
  /(\.test\.|\.spec\.|test-support|test-helpers|\.fixtures?\.|\/test\/|\/tests\/|\/__tests__\/|\/testing\/|\/fixtures\/)/u;
export const isTestFile = rel => TEST_RE.test(rel);

export function createParser(root) {
  const cache = new Map();
  return function parse(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return null;
    const text = fs.readFileSync(abs, 'utf8');
    const kind = rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
    if (sf.parseDiagnostics?.length) {
      const first = sf.parseDiagnostics[0];
      throw new ScanError(
        `syntax error in ${rel}: ${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`
      );
    }
    cache.set(rel, sf);
    return sf;
  };
}

export const lineOf = node =>
  node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
export const textOf = node => node.getText().replace(/\s+/gu, ' ');

export function directiveOf(body) {
  const out = [];
  for (const statement of body?.statements ?? []) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    out.push(statement.expression.text);
  }
  return out;
}

export const isUseServerModule = sf => directiveOf(sf).includes('use server');
export const isUseClientModule = sf => directiveOf(sf).includes('use client');

export function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isAwaitExpression(current))
  )
    current = current.expression;
  return current;
}

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx', ''];
function firstExisting(root, base) {
  for (const ext of EXTENSIONS) {
    const rel = path.posix.normalize(base + ext);
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return rel;
  }
  return null;
}

// Resolves a module specifier to a repo-relative source path: relative, `@/` (apps/web/src) and
// `@interdomestik/<pkg>[/sub]` through the package's `exports`. Anything else is external (null).
export function resolveModule(root, fromRel, specifier) {
  if (specifier.startsWith('.'))
    return firstExisting(root, path.posix.join(path.posix.dirname(fromRel), specifier));
  if (specifier.startsWith('@/')) return firstExisting(root, `apps/web/src/${specifier.slice(2)}`);
  const match = /^@interdomestik\/([^/]+)(\/.*)?$/u.exec(specifier);
  if (!match) return null;
  const pkgJson = path.join(root, 'packages', match[1], 'package.json');
  if (!fs.existsSync(pkgJson)) return null;
  const exportsMap = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).exports ?? {};
  const key = `.${match[2] ?? ''}`;
  const target = typeof exportsMap[key] === 'string' ? exportsMap[key] : exportsMap[key]?.default;
  if (typeof target !== 'string') return null;
  return firstExisting(
    root,
    path.posix.join('packages', match[1], target.replace(/\.(ts|tsx|js)$/u, ''))
  );
}

function bindingsOf(clause, specifier) {
  const entries = [];
  if (clause.name) entries.push([clause.name.text, { specifier, imported: 'default' }]);
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings))
    entries.push([bindings.name.text, { specifier, imported: '*' }]);
  if (bindings && ts.isNamedImports(bindings))
    for (const element of bindings.elements.filter(e => !e.isTypeOnly))
      entries.push([
        element.name.text,
        { specifier, imported: (element.propertyName ?? element.name).text },
      ]);
  return entries;
}

// Local import bindings of a file: local name -> { specifier, imported } (imported 'default' / '*').
export function importsOf(sf) {
  const map = new Map();
  for (const statement of sf.statements) {
    const clause = ts.isImportDeclaration(statement) && statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    for (const [name, binding] of bindingsOf(clause, statement.moduleSpecifier.text))
      map.set(name, binding);
  }
  return map;
}

// Top-level declarations by name (functions, classes, variables incl. destructured, types).
export function topLevelDeclarations(sf) {
  const map = new Map();
  const bind = (name, node) => map.has(name) || map.set(name, node);
  const bindPattern = (nameNode, decl) => {
    if (ts.isIdentifier(nameNode)) return bind(nameNode.text, decl);
    for (const element of nameNode.elements ?? [])
      if (!ts.isOmittedExpression(element)) bindPattern(element.name, decl);
  };
  for (const statement of sf.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name)
      bind(statement.name.text, statement);
    else if (ts.isVariableStatement(statement))
      for (const decl of statement.declarationList.declarations) bindPattern(decl.name, decl);
    else if (
      (ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    )
      bind(statement.name.text, statement);
  }
  return map;
}

export const isTypeDeclaration = node =>
  Boolean(node) && (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node));

export const hasExportModifier = node =>
  Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
export const hasDefaultModifier = node =>
  Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword));

export function functionName(node) {
  for (let current = node; current; current = current.parent) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name)
      return current.name.getText();
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent)
    )
      return current.parent.name.getText();
  }
  return '<module>';
}
