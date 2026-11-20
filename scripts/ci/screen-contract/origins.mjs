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

function importBinding(sf, local) {
  for (const statement of sf.statements) {
    const clause = ts.isImportDeclaration(statement) && statement.importClause;
    if (!clause) continue;
    const specifier = statement.moduleSpecifier.text;
    if (clause.name?.text === local) return { specifier, name: 'default' };
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const element of bindings.elements)
        if (element.name.text === local)
          return { specifier, name: (element.propertyName ?? element.name).text };
  }
  return null;
}

// { file, name } of `name` exported by `rel`, or null when it cannot be found.
export function originIn(resolver, rel, name, depth = 0, seen = new Set()) {
  const visit = `${rel}#${name}`;
  if (depth > MAX_DEPTH || seen.has(visit)) return null;
  seen.add(visit);
  const sf = parse(resolver.root, rel);
  const stars = [];
  for (const statement of sf.statements) {
    if (ts.isExportDeclaration(statement)) {
      const from =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : null;
      const clause = statement.exportClause;
      if (!clause && from) {
        stars.push(from);
        continue;
      }
      if (clause && ts.isNamedExports(clause))
        for (const element of clause.elements) {
          if (element.name.text !== name) continue;
          const original = (element.propertyName ?? element.name).text;
          if (from) return originOf(resolver, rel, from, original, depth + 1, seen);
          const imported = importBinding(sf, original);
          if (imported)
            return originOf(resolver, rel, imported.specifier, imported.name, depth + 1, seen);
          return { file: rel, name: original };
        }
    } else if (hasExportModifier(statement)) {
      if (name === 'default' && hasDefaultModifier(statement))
        return { file: rel, name: 'default' };
      if (declaredNames(statement).includes(name)) return { file: rel, name };
    } else if (ts.isExportAssignment(statement) && name === 'default')
      return { file: rel, name: 'default' };
  }
  for (const from of stars) {
    const hit = originOf(resolver, rel, from, name, depth + 1, seen);
    if (hit) return hit;
  }
  return null;
}

// The origin of `name` imported from `specifier` by `fromRel`; an external module is its own origin.
export function originOf(resolver, fromRel, specifier, name, depth = 0, seen = new Set()) {
  const file = resolver.resolveFile(fromRel, specifier);
  if (!file) return { file: specifier, name, external: true };
  return originIn(resolver, file, name, depth, seen) ?? { file, name, unresolved: true };
}
