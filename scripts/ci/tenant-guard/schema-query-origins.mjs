import ts from 'typescript';
import { TEST_SOURCE } from './manifest.mjs';
import { analyzeScopes, isFunctionLike, referenceForm } from './syntax.mjs';

export const DB = 'packages/database/src/db.ts';
export const DB_EXPORTS = new Set(['db', 'dbAdmin', 'dbRls']);
export const CLIENT = Symbol('Drizzle client');
export const ENTRY = Symbol('tenant transaction entry');
export const DATA = Symbol('non-client data');
export const ITEM = Symbol('array item');
export const ABSENT = Symbol('absent value');
export const MAX_PROVENANCE_DEPTH = 64;

const TENANT_ENTRIES = new Set([
  'packages/database/src/tenant.ts#withTenantContext',
  'packages/database/src/tenant.ts#withTenantDb',
  'packages/database/src/tenant-authority-context.ts#withTenantAuthority',
]);

export function clientOrigin({ file, name }) {
  if (file === DB && DB_EXPORTS.has(name)) return CLIENT;
  if (TENANT_ENTRIES.has(`${file}#${name}`)) return ENTRY;
  return null;
}

export function memberKey(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression))
    return node.argumentExpression.text;
  return null;
}

export const plainName = node =>
  node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null;

export function outerValue(node) {
  while (node.parent && ts.skipOuterExpressions(node.parent) === node) node = node.parent;
  return node;
}

export function bindingPath(id) {
  const path = [];
  for (let node = id.parent; ts.isBindingElement(node); node = node.parent.parent) {
    const pattern = node.parent;
    const key = ts.isArrayBindingPattern(pattern)
      ? String(pattern.elements.indexOf(node))
      : plainName(node.propertyName ?? node.name);
    if (node.dotDotDotToken || key === null) return null;
    path.unshift(key);
  }
  return path;
}

export function parameterOf(binding) {
  let node = binding.id;
  while (node.parent && !ts.isParameter(node)) node = node.parent;
  return ts.isParameter(node) ? node : null;
}

export function returnsOf(fn) {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const returns = [];
  const visit = node => {
    if (ts.isReturnStatement(node)) returns.push(node.expression);
    else if (!isFunctionLike(node)) ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return returns;
}

export function directArgument(node) {
  const value = outerValue(node);
  const call = value.parent;
  if (!ts.isCallExpression(call)) return null;
  const index = call.arguments.indexOf(value);
  return index < 0 ? null : { call, index };
}

export function createQueryOrigins(tree) {
  const graph = tree.inventory;
  const scopes = new Map();
  const sourceOf = file => graph.sourceFileOf(file);
  const scopeOf = source => {
    if (!scopes.has(source)) scopes.set(source, indexScopes(source));
    return scopes.get(source);
  };
  const lookup = node => scopeOf(node.getSourceFile()).lookup(node);
  const uses = binding => scopeOf(binding.id.getSourceFile()).uses.get(binding) ?? [];
  const imports = (source, binding, member) => {
    const name = binding.imported === '*' ? member ?? '*' : binding.imported;
    return graph.resolveImport(source.fileName, binding.specifier, name);
  };
  const local = (file, name) => {
    const source = sourceOf(file);
    if (!source) return null;
    return scopeOf(source).top.get(name);
  };
  const functionUses = fn => usesOfFunction(tree, { scopeOf, uses }, fn);
  return {
    graph, lookup, uses, imports, local, functionUses,
    isGlobal: (node, name) => ts.isIdentifier(node) && node.text === name && !lookup(node),
  };
}

function indexScopes(source) {
  const { references, lookup } = analyzeScopes(source);
  const uses = new Map();
  const top = new Map();
  for (const { node, binding } of references) {
    if (!binding) continue;
    if (!uses.has(binding)) uses.set(binding, []);
    uses.get(binding).push(node);
  }
  const visit = node => {
    if (ts.isIdentifier(node)) {
      const binding = lookup(node);
      if (binding?.id === node && binding.scope === source) top.set(node.text, binding);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { lookup, uses, top };
}

function usesOfFunction(tree, env, fn) {
  const source = fn.getSourceFile();
  const declaration = ts.isVariableDeclaration(fn.parent) ? fn.parent : fn;
  const name = declaration.name && plainName(declaration.name);
  if (!name) return [];
  const { lookup } = env.scopeOf(source);
  const binding = lookup(declaration.name);
  if (binding?.decl !== declaration) return [];
  const local = env.uses(binding);
  if (binding.scope !== source) return local;
  const exports = [...tree.inventory.exportNames(source.fileName)].filter(key =>
    tree.inventory.resolveExport(source.fileName, key).some(
      origin => origin.file === source.fileName && origin.name === name
    )
  );
  if (!exports.length) return local;
  const remote = [];
  for (const [file, text] of tree.allSources) {
    if (file === source.fileName || TEST_SOURCE.test(file) || !exports.some(key => text.includes(key)))
      continue;
    remote.push(...importedUses(tree, env, file, source.fileName, name));
  }
  return [...local, ...remote];
}

function importedUses(tree, env, file, owner, name) {
  const source = tree.inventory.sourceFileOf(file);
  const { top } = env.scopeOf(source);
  const matches = dynamicImportUses(tree, env, source, owner, name);
  for (const binding of top.values()) {
    if (binding.kind !== 'import' || !binding.specifier) continue;
    const refs = env.uses(binding);
    if (binding.imported !== '*') {
      const origins = tree.inventory.resolveImport(file, binding.specifier, binding.imported);
      if (origins.some(origin => origin.file === owner && origin.name === name))
        matches.push(...refs);
      continue;
    }
    matches.push(...namespaceFunctionUses(tree.inventory, file, binding, refs, owner, name));
  }
  return matches;
}

function namespaceFunctionUses(graph, file, binding, refs, owner, name) {
  const matches = [];
  for (const node of refs) {
    const parent = outerValue(node).parent;
    const key = memberKey(parent);
    if (key === null) continue;
    const origins = graph.resolveImport(file, binding.specifier, key);
    if (origins.some(origin => origin.file === owner && origin.name === name)) matches.push(parent);
  }
  return matches;
}

function dynamicImportUses(tree, env, source, owner, name) {
  const matches = [];
  const { lookup } = env.scopeOf(source);
  const visit = node => {
    const imported = dynamicBinding(node);
    if (imported) {
      const { specifier, key, local } = imported;
      const origins = tree.inventory.resolveImport(source.fileName, specifier, key);
      const binding = lookup(local);
      if (binding && origins.some(origin => origin.file === owner && origin.name === name))
        matches.push(...env.uses(binding));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return matches;
}

function dynamicBinding(node) {
  if (!ts.isBindingElement(node) || !ts.isIdentifier(node.name) || node.dotDotDotToken)
    return null;
  const declaration = node.parent.parent;
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return null;
  const initializer = ts.skipOuterExpressions(declaration.initializer);
  const load = ts.isAwaitExpression(initializer) ? initializer.expression : initializer;
  if (!ts.isCallExpression(load) || load.expression.kind !== ts.SyntaxKind.ImportKeyword) return null;
  const [specifier] = load.arguments;
  const key = plainName(node.propertyName ?? node.name);
  return key && specifier && ts.isStringLiteral(specifier)
    ? { specifier: specifier.text, key, local: node.name }
    : null;
}

export function calledAt(reference) {
  const node = outerValue(reference);
  if (referenceForm(node) === 'export') return undefined;
  return ts.isCallExpression(node.parent) && node.parent.expression === node ? node.parent : null;
}
