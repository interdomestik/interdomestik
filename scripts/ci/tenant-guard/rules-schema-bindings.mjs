import ts from 'typescript';
import { originKey } from './modules.mjs';
import { byCodeUnit } from './rules-digest.mjs';

function aliasReference(initializer) {
  const value = ts.skipOuterExpressions(initializer);
  if (ts.isIdentifier(value)) return { name: value.text };
  if (ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression))
    return { name: value.expression.text, member: value.name.text };
  if (
    ts.isElementAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    ts.isStringLiteralLike(value.argumentExpression)
  )
    return { name: value.expression.text, member: value.argumentExpression.text };
  return null;
}

export function aliasInitializers(source) {
  const aliases = new Map();
  for (const statement of source.statements.filter(ts.isVariableStatement)) {
    for (const { name, initializer } of statement.declarationList.declarations) {
      if (!ts.isIdentifier(name) || !initializer) continue;
      const binding = aliasReference(initializer);
      if (binding) aliases.set(name.text, binding);
    }
  }
  return aliases;
}

export function aliasTarget(aliases, name) {
  const seen = new Set();
  let member;
  while (aliases.has(name)) {
    if (seen.has(name)) return null;
    seen.add(name);
    const target = aliases.get(name);
    if (member !== undefined && target.member !== undefined) return null;
    name = target.name;
    member ??= target.member;
  }
  return { name, member };
}

function initializerOrigins(graph, inventory, origin) {
  const aliases = inventory.tables.get(origin.file)?.aliases;
  if (!aliases?.has(origin.name)) return [];
  const target = aliasTarget(aliases, origin.name);
  if (!target) return [];
  const imported = graph.tableOf(origin.file).imports.get(target.name);
  if (!imported)
    return target.member === undefined ? [{ file: origin.file, name: target.name }] : [];
  if (target.member === undefined)
    return graph.resolveImport(origin.file, imported.specifier, imported.imported);
  if (imported.imported !== '*') return [];
  return graph.resolveImport(origin.file, imported.specifier, target.member);
}

export function publicTableBindings(graph, inventory, file, name, tables) {
  const queue = graph.resolveExport(file, name);
  const seen = new Set();
  const bindings = [];
  for (const origin of queue) {
    const key = originKey(origin);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (tables.has(key)) bindings.push(key);
    else queue.push(...initializerOrigins(graph, inventory, origin));
  }
  return bindings.sort(byCodeUnit);
}
