// The origin of an imported name: the file and export it is declared in, followed through
// `export { a as b } from`, `export * from` and re-exported imports (WP-05 design §2.1). Syntax only.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { hasExportModifier, hasDefaultModifier } from '../server-mutation/ast.mjs';

const MAX_DEPTH = 12;
const parsed = new Map();

function parse(root, rel) {
  const key = `${root}\u0000${rel}`;
  if (!parsed.has(key)) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const kind = rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    parsed.set(key, ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false, kind));
  }
  return parsed.get(key);
}

const declaredNames = statement => {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name)
    return [statement.name.text];
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations
      .filter(d => ts.isIdentifier(d.name))
      .map(d => d.name.text);
  return [];
};

function namedImport(bindings, local) {
  if (!bindings || !ts.isNamedImports(bindings)) return null;
  const element = bindings.elements.find(e => e.name.text === local);
  return element ? (element.propertyName ?? element.name).text : null;
}

function importBinding(sf, local) {
  for (const statement of sf.statements) {
    const clause = ts.isImportDeclaration(statement) && statement.importClause;
    if (!clause) continue;
    const specifier = statement.moduleSpecifier.text;
    if (clause.name?.text === local) return { specifier, name: 'default' };
    const name = namedImport(clause.namedBindings, local);
    if (name !== null) return { specifier, name };
  }
  return null;
}

// What `export { … }` gives `scope.name`: its origin, or undefined when the clause does not list it.
function namedExportOrigin(scope, clause, from) {
  const { resolver, rel, name, depth, seen } = scope;
  for (const element of clause.elements) {
    if (element.name.text !== name) continue;
    const original = (element.propertyName ?? element.name).text;
    if (from) return originOf(resolver, rel, from, original, depth + 1, seen);
    const imported = importBinding(scope.sf, original);
    if (imported)
      return originOf(resolver, rel, imported.specifier, imported.name, depth + 1, seen);
    return { file: rel, name: original };
  }
  return undefined;
}

// An `export … from` / `export { … }` statement; an `export * from` is kept in `stars` for later.
function exportDeclarationOrigin(scope, statement, stars) {
  const from =
    statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : null;
  const clause = statement.exportClause;
  if (!clause && from) {
    stars.push(from);
    return undefined;
  }
  if (clause && ts.isNamedExports(clause)) return namedExportOrigin(scope, clause, from);
  return undefined;
}

// An exported declaration or `export default …` that declares `scope.name` here.
function declarationOrigin(scope, statement) {
  const { rel, name } = scope;
  if (hasExportModifier(statement)) {
    if (name === 'default' && hasDefaultModifier(statement)) return { file: rel, name: 'default' };
    if (declaredNames(statement).includes(name)) return { file: rel, name };
    return undefined;
  }
  if (ts.isExportAssignment(statement) && name === 'default') return { file: rel, name: 'default' };
  return undefined;
}

// What `export * from` gives `scope.name`: every star is searched (B6). A module that lacks the
// name is skipped; one origin is the answer; two different origins are ambiguous, which ES treats
// as not exported. An external star counts only when no local star has the name.
function starOrigin(scope, stars) {
  const { resolver, rel, name, depth, seen } = scope;
  const found = new Map();
  let external = null;
  for (const from of stars) {
    const hit = originOf(resolver, rel, from, name, depth + 1, seen);
    if (hit.ambiguous) return hit;
    if (hit.external) external ??= hit;
    else if (!hit.unresolved) found.set(`${hit.file}#${hit.name}`, hit);
  }
  if (found.size > 1) return { file: rel, name, unresolved: true, ambiguous: true };
  return found.size === 1 ? [...found.values()][0] : external;
}

// { file, name } of `name` exported by `rel`, or null when it cannot be found. An ambiguous name
// (two `export *` providers) is `{ file: rel, name, unresolved: true, ambiguous: true }`.
export function originIn(resolver, rel, name, depth = 0, seen = new Set()) {
  const visit = `${rel}#${name}`;
  if (depth > MAX_DEPTH || seen.has(visit)) return null;
  seen.add(visit);
  const scope = { resolver, rel, name, depth, seen, sf: parse(resolver.root, rel) };
  const stars = [];
  for (const statement of scope.sf.statements) {
    const hit = ts.isExportDeclaration(statement)
      ? exportDeclarationOrigin(scope, statement, stars)
      : declarationOrigin(scope, statement);
    if (hit !== undefined) return hit;
  }
  return starOrigin(scope, stars);
}

// The origin of `name` imported from `specifier` by `fromRel`; an external module is its own origin.
export function originOf(resolver, fromRel, specifier, name, depth = 0, seen = new Set()) {
  const file = resolver.resolveFile(fromRel, specifier);
  if (!file) return { file: specifier, name, external: true };
  return originIn(resolver, file, name, depth, seen) ?? { file, name, unresolved: true };
}
