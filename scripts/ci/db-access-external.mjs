import ts from 'typescript';
import { isFunction, unwrap } from './db-access-source.mjs';

function importedAs(model, node, module, name) {
  let raw = model.rawDeclaration(node);
  if (!raw || !ts.isImportSpecifier(raw) || (raw.propertyName ?? raw.name).text !== name)
    return false;
  while (raw && !ts.isImportDeclaration(raw)) raw = raw.parent;
  return !!raw && ts.isStringLiteral(raw.moduleSpecifier) && raw.moduleSpecifier.text === module;
}

// Only Drizzle's declarative enum factory and relation callback DSL are supported.
// This never supplies tenant provenance or makes arbitrary external callbacks safe.
export function externalValue(model, node, provenance, seen = new Set()) {
  if (!node || seen.has(node) || seen.size > 48 || provenance.isMutated(node)) return false;
  seen = new Set(seen).add(node);
  let raw = model.rawDeclaration(node);
  const imported = raw && ts.isImportSpecifier(raw) ? (raw.propertyName ?? raw.name).text : '';
  while (raw && !ts.isImportDeclaration(raw) && !ts.isSourceFile(raw)) raw = raw.parent;
  if (raw && ts.isImportDeclaration(raw) && ts.isStringLiteral(raw.moduleSpecifier)) {
    if (raw.moduleSpecifier.text === 'drizzle-orm/pg-core' && imported === 'pgEnum') return true;
    if (raw.moduleSpecifier.text === 'drizzle-orm' && imported === 'relations') return true;
  }
  if (ts.isPropertyAccessExpression(node) && ['asc', 'desc'].includes(node.name.text)) {
    let receiver = node.expression;
    while (ts.isPropertyAccessExpression(receiver)) receiver = receiver.expression;
    const parameter = model.declaration(receiver);
    const fn = parameter && ts.isParameter(parameter) && parameter.parent;
    const call = fn && isFunction(fn) && fn.parent;
    if (
      call &&
      ts.isCallExpression(call) &&
      importedAs(model, call.expression, 'drizzle-orm/pg-core', 'pgTable')
    )
      return true;
  }
  const decl = model.declaration(node);
  if (decl && ts.isVariableDeclaration(decl) && decl.initializer)
    return externalValue(model, decl.initializer, provenance, seen);
  if (ts.isCallExpression(node)) return externalValue(model, node.expression, provenance, seen);
  if (decl && ts.isBindingElement(decl) && ts.isObjectBindingPattern(decl.parent)) {
    const key = (decl.propertyName ?? decl.name).text;
    const parameter = decl.parent.parent;
    if (!['one', 'many'].includes(key) || decl.initializer || !ts.isParameter(parameter))
      return false;
    const fn = parameter.parent;
    const invocation = fn.parent;
    return (
      isFunction(fn) &&
      ts.isCallExpression(invocation) &&
      externalValue(model, invocation.expression, provenance, seen)
    );
  }
  return false;
}

// A stable omitted default process.env argument is a known string environment map.
export function environmentStringMethod(model, provenance, node, invocation) {
  if (
    provenance.environmentChanges.size ||
    !ts.isPropertyAccessExpression(node) ||
    node.name.text !== 'trim'
  )
    return false;
  const value = node.expression;
  if (!ts.isPropertyAccessExpression(value)) return false;
  const parameter = model.declaration(value.expression);
  if (!parameter || !ts.isParameter(parameter) || !parameter.initializer) return false;
  if (provenance.mutations.has(model.symbol(parameter.name))) return false;
  const initial = parameter.initializer;
  if (
    !ts.isPropertyAccessExpression(initial) ||
    initial.name.text !== 'env' ||
    !ts.isIdentifier(initial.expression) ||
    initial.expression.text !== 'process' ||
    model.declaration(initial.expression)
  )
    return false;
  const calls =
    invocation && model.declaration(invocation.expression) === parameter.parent
      ? [invocation]
      : (provenance.calls.get(parameter.parent) ?? []);
  const index = parameter.parent.parameters.indexOf(parameter);
  return calls.length > 0 && calls.every(call => call.arguments.length <= index);
}

// Preserve only the authenticated unchanged schema bootstrap's observed declarative chains.
// This is not permission for candidate schema edits or arbitrary Drizzle/client methods.
export function trustedSchemaChain(model, provenance, raw) {
  const file = model.fileOf(raw);
  if (
    !file.startsWith('packages/database/src/schema/') ||
    model.sources.get(file) !== model.approvedSources.get(file)
  )
    return false;
  const methods = new Set([
    '$type',
    '$onUpdate',
    'default',
    'defaultNow',
    'defaultRandom',
    'notNull',
    'primaryKey',
    'references',
    'unique',
    'array',
    'on',
    'where',
    'onDelete',
    'enableRLS',
    'existing',
  ]);
  let node = unwrap(raw);
  const seen = new Set();
  while (node && !seen.has(node) && seen.size < 48) {
    seen.add(node);
    if (provenance.isMutated(node)) return false;
    if (ts.isCallExpression(node)) node = unwrap(node.expression);
    else if (ts.isPropertyAccessExpression(node) && methods.has(node.name.text))
      node = unwrap(node.expression);
    else {
      const decl = model.declaration(node);
      if (
        !decl ||
        !ts.isVariableDeclaration(decl) ||
        !decl.initializer ||
        !model.fileOf(decl).startsWith('packages/database/src/schema/') ||
        model.sources.get(model.fileOf(decl)) !== model.approvedSources.get(model.fileOf(decl))
      )
        break;
      node = unwrap(decl.initializer);
    }
  }
  if (!node || !ts.isIdentifier(node)) return false;
  const external = model.externalName(node);
  return (
    external?.module === 'drizzle-orm/pg-core' &&
    [
      'boolean',
      'check',
      'date',
      'decimal',
      'foreignKey',
      'index',
      'integer',
      'jsonb',
      'pgEnum',
      'pgPolicy',
      'pgTable',
      'pgView',
      'primaryKey',
      'text',
      'timestamp',
      'unique',
      'uniqueIndex',
      'uuid',
      'varchar',
    ].includes(external.name)
  );
}

// A frozen schema's direct column reference is data, despite old ORM argument escape taint.
// Explicit writes and every changed opaque-call taint retain UNKNOWN and reject remounts.
export function trustedSchemaColumn(model, provenance, raw) {
  const node = unwrap(raw);
  const file = model.fileOf(node);
  if (
    !ts.isPropertyAccessExpression(node) ||
    !file.startsWith('packages/database/src/schema/') ||
    model.sources.get(file) !== model.approvedSources.get(file)
  )
    return false;
  const table = unwrap(node.expression);
  const decl = model.declaration(table);
  if (
    !decl ||
    !ts.isVariableDeclaration(decl) ||
    provenance.unsafeMutations.has(model.symbol(table))
  )
    return false;
  const declarationFile = model.fileOf(decl);
  const initial = decl.initializer && unwrap(decl.initializer);
  if (
    !declarationFile.startsWith('packages/database/src/schema/') ||
    model.sources.get(declarationFile) !== model.approvedSources.get(declarationFile) ||
    !initial ||
    !ts.isCallExpression(initial)
  )
    return false;
  const factory = model.externalName(initial.expression);
  if (factory?.module !== 'drizzle-orm/pg-core' || !['pgTable', 'pgView'].includes(factory.name))
    return false;
  const columns = initial.arguments[1];
  return (
    !!columns &&
    ts.isObjectLiteralExpression(columns) &&
    columns.properties.some(
      item =>
        ts.isPropertyAssignment(item) &&
        item.name.getText().replace(/^['"]|['"]$/gu, '') === node.name.text &&
        trustedSchemaChain(model, provenance, item.initializer)
    )
  );
}

export function trustedSchemaSqlValue(model, provenance, raw) {
  const node = unwrap(raw),
    file = model.fileOf(node);
  const decl = model.declaration(node);
  if (
    !ts.isIdentifier(node) ||
    !file.startsWith('packages/database/src/schema/') ||
    model.sources.get(file) !== model.approvedSources.get(file) ||
    !decl ||
    !ts.isVariableDeclaration(decl) ||
    !decl.initializer ||
    provenance.unsafeMutations.has(model.symbol(node))
  )
    return false;
  const declarationFile = model.fileOf(decl),
    initial = unwrap(decl.initializer);
  const tag = ts.isTaggedTemplateExpression(initial) && model.externalName(initial.tag);
  return (
    declarationFile.startsWith('packages/database/src/schema/') &&
    model.sources.get(declarationFile) === model.approvedSources.get(declarationFile) &&
    tag?.module === 'drizzle-orm' &&
    tag.name === 'sql' &&
    !provenance.isMutated(initial.tag)
  );
}
