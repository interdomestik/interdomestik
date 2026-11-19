// CHK-04 units (design §6.1): runtime value exports of 'use server' modules (re-exports followed),
// function-level 'use server' directives, and every exported HTTP method of an app route.
import ts from 'typescript';

import {
  directiveOf,
  functionName,
  hasDefaultModifier,
  hasExportModifier,
  importsOf,
  isTestFile,
  isTypeDeclaration,
  isUseServerModule,
  resolveModule,
  shortHash,
  topLevelDeclarations,
} from './ast.mjs';
import { ROUTE_METHODS } from './registry.mjs';

// Export table of one module: name -> { local } | { from, name } | { decl }, plus `export *` sources.
function exportTable(sf) {
  const named = new Map();
  const stars = [];
  const decls = topLevelDeclarations(sf);
  for (const statement of sf.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const from = statement.moduleSpecifier?.text;
      if (!statement.exportClause) {
        if (from) stars.push(from);
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const local = (element.propertyName ?? element.name).text;
        named.set(element.name.text, from ? { from, name: local } : { local });
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      named.set('default', { decl: statement });
    } else if (hasExportModifier(statement)) {
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
      if (hasDefaultModifier(statement)) named.set('default', { decl: statement });
      else if (ts.isVariableStatement(statement)) {
        for (const [name, decl] of decls)
          if (decl.parent?.parent === statement) named.set(name, { decl });
      } else if (statement.name) named.set(statement.name.text, { decl: statement });
    }
  }
  return { named, stars, decls };
}

export function createExportResolver(root, parse) {
  const tables = new Map();
  const table = file => {
    if (!tables.has(file)) {
      const sf = parse(file);
      tables.set(file, sf ? { sf, ...exportTable(sf) } : null);
    }
    return tables.get(file);
  };
  // Resolves an exported name to its defining declaration: { file, decl } | { external } | null.
  function resolve(file, name, seen = new Set()) {
    const key = `${file}#${name}`;
    const t = table(file);
    if (!t || seen.has(key)) return null;
    seen.add(key);
    const entry = t.named.get(name);
    if (entry?.decl) return { file, decl: entry.decl };
    if (entry?.from) return follow(file, entry.from, entry.name, seen);
    if (entry?.local) return resolveLocal(file, t, entry.local, seen);
    for (const star of t.stars) {
      const target = resolveModule(root, file, star);
      const hit = target && resolve(target, name, seen);
      if (hit) return hit;
    }
    return null;
  }
  function follow(file, specifier, name, seen) {
    const target = resolveModule(root, file, specifier);
    return target ? resolve(target, name, seen) : { external: `${specifier}#${name}` };
  }
  function resolveLocal(file, t, local, seen) {
    const decl = t.decls.get(local);
    if (decl) return { file, decl };
    const imported = importsOf(t.sf).get(local);
    return imported ? follow(file, imported.specifier, imported.imported, seen) : null;
  }
  // Every value export name of a module, `export *` enumerated.
  function names(file, seen = new Set()) {
    const t = table(file);
    if (!t || seen.has(file)) return [];
    seen.add(file);
    const out = new Set();
    for (const [name, entry] of t.named) {
      if (entry.local && isTypeDeclaration(t.decls.get(entry.local))) continue;
      out.add(name);
    }
    for (const star of t.stars) {
      const target = resolveModule(root, file, star);
      if (target) for (const name of names(target, seen)) if (name !== 'default') out.add(name);
    }
    return [...out].sort();
  }
  return { resolve, names, table };
}

const isRouteFile = file => /^apps\/web\/src\/app\/.*\/route\.ts$/u.test(file);

export function collectUnits({ root, files, parse }) {
  const resolver = createExportResolver(root, parse);
  const actions = [];
  const inline = [];
  const routes = [];
  for (const file of files) {
    if (!file.startsWith('apps/web/src/') || isTestFile(file)) continue;
    const sf = parse(file);
    if (isUseServerModule(sf))
      for (const name of resolver.names(file)) {
        const target = resolver.resolve(file, name);
        if (target?.decl && isTypeDeclaration(target.decl)) continue;
        actions.push({ id: `${file}#${name}`, file, name, target });
      }
    if (isRouteFile(file))
      for (const method of ROUTE_METHODS)
        if (resolver.table(file).named.has(method) || resolver.resolve(file, method))
          routes.push({
            id: `${file}#${method}`,
            file,
            method,
            target: resolver.resolve(file, method),
          });
    sf.forEachChild(function visit(node) {
      if (
        ts.isFunctionLike(node) &&
        node.body &&
        ts.isBlock(node.body) &&
        directiveOf(node.body).includes('use server')
      )
        inline.push({
          id: `${file}#${functionName(node)}#${shortHash(node.body.getText())}`,
          file,
          node,
        });
      node.forEachChild(visit);
    });
  }
  return { actions, inline, routes, resolver };
}
