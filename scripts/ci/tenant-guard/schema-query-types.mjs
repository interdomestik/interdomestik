import ts from 'typescript';
import {
  ABSENT, CLIENT, DATA, ITEM, MAX_PROVENANCE_DEPTH, clientOrigin, plainName,
} from './schema-query-origins.mjs';

const TENANT = 'packages/database/src/tenant.ts';
const DB_INDEX = 'packages/database/src/index.ts';
const SCALARS = new Set([
  ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.UndefinedKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.NeverKeyword,
]);

export function mergeOrigins(values) {
  const first = values.find(value => value !== ABSENT);
  if (first === undefined) return values.length ? ABSENT : null;
  return first && values.every(value => value === first || value === ABSENT) ? first : null;
}

// Type syntax supplies a record contract for a declared parameter. Assertions on value
// expressions never supply that evidence, and resolved transaction callbacks take precedence.
export function declaredQueryType(env, type, path, seen = new Set()) {
  if (!type || seen.has(type) || seen.size >= MAX_PROVENANCE_DEPTH) return null;
  const visit = (next, rest = path) => declaredQueryType(env, next, rest, new Set([...seen, type]));
  if (ts.isParenthesizedTypeNode(type) || ts.isTypeOperatorNode(type)) return visit(type.type);
  if (ts.isUnionTypeNode(type)) return mergeOrigins(type.types.map(part => visit(part)));
  if (ts.isIntersectionTypeNode(type)) return mergeIntersection(type.types.map(part => visit(part)));
  if (ts.isTypeLiteralNode(type)) return memberType(type.members, path, visit);
  if (ts.isArrayTypeNode(type) && path[0] === ITEM) return visit(type.elementType, path.slice(1));
  return referencedType(env, type, path, visit);
}

function referencedType(env, type, path, visit) {
  if (ts.isTypeReferenceNode(type)) return typeReference(env, type, path, visit);
  if (ts.isIndexedAccessTypeNode(type) && ts.isLiteralTypeNode(type.indexType))
    return visit(type.objectType, [plainName(type.indexType.literal), ...path]);
  if (ts.isImportTypeNode(type)) return clientImportType(env, type, path);
  if (ts.isTypeQueryNode(type) && !path.length) return clientTypeQuery(env, type);
  if (!path.length && (SCALARS.has(type.kind) || ts.isLiteralTypeNode(type))) return DATA;
  return null;
}

export function contextualQueryType(env, fn, index, path) {
  const property = fn.parent;
  if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.parent))
    return null;
  const container = property.parent.parent;
  if (!ts.isVariableDeclaration(container) || !container.type) return null;
  const key = plainName(property.name);
  return key ? declaredQueryType(env, container.type, [key, { parameter: index }, ...path]) : null;
}

function mergeIntersection(values) {
  if (values.includes(CLIENT)) return CLIENT;
  return values.includes(DATA) ? DATA : null;
}

function memberType(members, [key, ...rest], visit) {
  const member = members.find(each => plainName(each.name) === key);
  if (member && ts.isPropertySignature(member)) return visit(member.type, rest);
  const [step, ...value] = rest;
  if (!member || !ts.isMethodSignature(member) || typeof step?.parameter !== 'number') return null;
  return visit(member.parameters[step.parameter]?.type, value);
}

function typeReference(env, type, path, visit) {
  const name = plainName(type.typeName);
  const [argument] = type.typeArguments ?? [];
  if (!name) return null;
  const definition = typeDeclaration(type.getSourceFile(), name);
  if (!definition && argument) return builtinType(name, argument, path, visit);
  if (definition) return declarationType(definition, path, visit);
  const origin = importedType(env, type.getSourceFile(), name);
  return originType(env, origin, path, visit);
}

function declarationType(definition, path, visit) {
  if (ts.isInterfaceDeclaration(definition)) return memberType(definition.members, path, visit);
  if (!path.length && tenantTransaction(definition)) return CLIENT;
  return visit(definition.type);
}

function originType(env, origin, path, visit) {
  if (!origin) return null;
  if (!path.length && origin.external === 'drizzle-orm' && origin.name === 'SQL') return DATA;
  if (!path.length && origin.name === 'TenantTransaction' && tenantTypeOrigin(env, origin.file))
    return CLIENT;
  const source = origin.file && env.graph.sourceFileOf(origin.file);
  const remote = source && typeDeclaration(source, origin.name);
  return remote ? declarationType(remote, path, visit) : null;
}

function tenantTransaction(definition) {
  return definition.name.text === 'TenantTransaction' && definition.getSourceFile().fileName === TENANT;
}

function tenantTypeOrigin(env, file) {
  if (file === TENANT) return true;
  if (file !== DB_INDEX) return false;
  return env.graph.sourceFileOf(file).statements.some(node =>
    ts.isExportDeclaration(node) && node.moduleSpecifier?.text === './tenant' &&
    node.exportClause && ts.isNamedExports(node.exportClause) &&
    node.exportClause.elements.some(entry =>
      entry.name.text === 'TenantTransaction' && (entry.propertyName ?? entry.name).text === 'TenantTransaction'
    )
  );
}

function builtinType(name, argument, path, visit) {
  if (['Promise', 'Readonly', 'Pick', 'Required', 'Partial'].includes(name)) return visit(argument);
  if (['Array', 'ReadonlyArray'].includes(name) && path[0] === ITEM)
    return visit(argument, path.slice(1));
  return null;
}

function clientTypeQuery(env, type) {
  const name = plainName(type.exprName);
  if (!name) return null;
  const origin = importedType(env, type.getSourceFile(), name);
  return origin && clientOrigin(origin) === CLIENT ? CLIENT : null;
}

function clientImportType(env, type, path) {
  if (!type.isTypeOf || !ts.isLiteralTypeNode(type.argument)) return null;
  const specifier = plainName(type.argument.literal);
  const key = plainName(type.qualifier) ?? path[0];
  const rest = type.qualifier ? path : path.slice(1);
  if (!key || rest.length || !specifier) return null;
  return mergeOrigins(env.graph.resolveImport(type.getSourceFile().fileName, specifier, key)
    .map(clientOrigin));
}

function typeDeclaration(source, name) {
  return source.statements.find(
    node => (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name.text === name
  );
}

function importedType(env, source, name) {
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const entry = bindings.elements.find(each => each.name.text === name);
    if (!entry) continue;
    const original = (entry.propertyName ?? entry.name).text;
    const specifier = node.moduleSpecifier.text;
    const origins = env.graph.resolveImport(source.fileName, specifier, original);
    if (origins.length === 1) return origins[0];
    const { files } = env.graph.resolveSpecifier(source.fileName, specifier);
    if (files.length === 1) return { file: files[0], name: original };
    return null;
  }
  return null;
}
