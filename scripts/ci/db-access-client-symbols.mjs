import ts from 'typescript';
import { unwrap } from './db-access-source.mjs';
const UNKNOWN = 'unknown';
const DB_FILE = 'packages/database/src/db.ts';
const CONTEXT_FILE = 'packages/database/src/tenant.ts';
export function createClientSymbols(model, mutations) {
  function clientProperty(raw, key, seen) {
    const node = unwrap(raw);
    if (!node || seen.has(node) || seen.size > 64) return UNKNOWN;
    seen = new Set(seen).add(node);
    if (ts.isObjectLiteralExpression(node)) {
      const property = node.properties.find(
        item => item.name?.getText().replace(/^['"]|['"]$/gu, '') === key
      );
      if (property && ts.isPropertyAssignment(property))
        return clientIdentity(property.initializer, seen);
      if (property && ts.isShorthandPropertyAssignment(property))
        return clientIdentity(property.name, seen);
      return UNKNOWN;
    }
    const rawDecl = model.rawDeclaration(node);
    if (rawDecl && ts.isNamespaceImport(rawDecl)) {
      const imported = rawDecl.parent.parent;
      const file = model.moduleFile(imported.moduleSpecifier.text, model.fileOf(node));
      return file ? clientIdentity(model.exportDeclaration(file, key), seen) : UNKNOWN;
    }
    const decl = model.declaration(node);
    return decl && ts.isVariableDeclaration(decl) && decl.initializer
      ? clientProperty(decl.initializer, key, seen)
      : UNKNOWN;
  }
  // An object destructuring element resolves through its holder's actual initializer only;
  // undefined means the declaration is not such an element.
  function bindingIdentity(decl, seen) {
    if (!ts.isBindingElement(decl) || !ts.isObjectBindingPattern(decl.parent)) return undefined;
    const holder = decl.parent.parent;
    return holder.initializer
      ? clientProperty(holder.initializer, (decl.propertyName ?? decl.name).text, seen)
      : UNKNOWN;
  }
  function clientIdentity(raw, seen = new Set()) {
    const node = unwrap(raw);
    if (!node || seen.has(node) || seen.size > 64) return UNKNOWN;
    seen = new Set(seen).add(node);
    const decl = model.declaration(node);
    const named = decl ?? (ts.isVariableDeclaration(node.parent) ? node.parent : undefined);
    if (
      named &&
      model.fileOf(named) === DB_FILE &&
      ['db', 'dbRls', 'dbAdmin'].includes(named.name?.text)
    )
      return named.name.text;
    if (ts.isPropertyAccessExpression(node)) {
      const identity = clientProperty(node.expression, node.name.text, seen);
      if (identity !== UNKNOWN) return identity;
    }
    if (!decl) return UNKNOWN;
    if (ts.isShorthandPropertyAssignment(decl)) return clientIdentity(decl.name, seen);
    if (ts.isPropertyAssignment(decl)) return clientIdentity(decl.initializer, seen);
    const bound = bindingIdentity(decl, seen);
    if (bound !== undefined) return bound;
    return ts.isVariableDeclaration(decl) && decl.initializer
      ? clientIdentity(decl.initializer, seen)
      : UNKNOWN;
  }
  function canonical(node, seen = new Set()) {
    node = unwrap(node);
    if (!node || seen.has(node) || mutations.has(model.symbol(node))) return false;
    seen.add(node);
    const decl = model.declaration(node);
    if (!decl) return false;
    if (model.providerCanonical?.(decl)) return true;
    if (
      model.fileOf(decl) === CONTEXT_FILE &&
      ['withTenantContext', 'withTenantDb'].includes(decl.name?.text)
    )
      return true;
    return ts.isVariableDeclaration(decl) && decl.initializer
      ? canonical(decl.initializer, seen)
      : false;
  }
  return { clientIdentity, canonical };
}
