import ts from 'typescript';
import { originKey } from './modules.mjs';
import { analyzeScopes } from './syntax.mjs';

export const SCHEMA_DIR = 'packages/database/src/schema/';
const PG = 'drizzle-orm/pg-core';
const ORM = 'drizzle-orm';
export const COLUMNS = new Set([
  'text',
  'integer',
  'bigint',
  'boolean',
  'numeric',
  'date',
  'timestamp',
  'uuid',
  'jsonb',
  'varchar',
  'serial',
]);
export const INDEXES = new Set(['index', 'unique', 'uniqueIndex', 'primaryKey']);
export const INFERRED_TYPES = new Set(['$inferSelect', '$inferInsert']);
const EXTRA = new Set([...INDEXES, 'check', 'foreignKey', 'pgPolicy']);
const BLOCKED = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  'prototype',
  'then',
  'enableRLS',
  ...INFERRED_TYPES,
]);
const RELATION_NAME = /^[a-z_][a-z0-9_]{0,62}$/u;
const JS_NAME = /^[A-Za-z_]\w{0,62}$/u;
const TABLE_BUILDERS = new Set(['pgTable', 'pgView', 'pgMaterializedView']);
const LEGACY_BUILDERS =
  /^(?:pgTable|pgView|pgMaterializedView|pgSchema|PgTable|PgView|PgMaterializedView)/u;

export const literal = node =>
  node && ts.isStringLiteral(node) && RELATION_NAME.test(node.text) && !BLOCKED.has(node.text);
export const nameOf = node =>
  node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null;
export const allowedName = name =>
  typeof name === 'string' && JS_NAME.test(name) && !BLOCKED.has(name);
export const simpleCall = node =>
  node && ts.isCallExpression(node) && !node.questionDotToken && !node.typeArguments;
export const shadowed = (context, name) =>
  context.local.has(name) ||
  context.builders.has(name) ||
  context.importedTables.has(name) ||
  context.helper === name;

const LOADERS = new Set(['require', 'Function', 'eval']);
const GLOBALS = new Set(['global', 'globalThis', 'process', 'window', 'self', 'module', 'exports']);

export function builderLoaderProblem(source) {
  let reason = null;
  const visit = node => {
    if (reason) return;
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || LOADERS.has(nameOf(node.expression)))
    )
      reason = 'forbidden builder loader';
    if (ts.isImportEqualsDeclaration(node)) reason = 'forbidden builder loader';
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (reason) return reason;
  return analyzeScopes(source).references.some(
    ({ node, binding }) => !binding && GLOBALS.has(node.text)
  )
    ? 'unproven global access'
    : null;
}

// This exact function is accepted only from its anchor-bound module with the reviewed imports.
const POLICY = `export function sponsorTenantPolicy(name: string, tenantId: unknown) {
  const predicate = sql\`\${tenantId} = (select current_setting('app.current_access_tenant_id', true))::text\`;
  return pgPolicy(name, {
    as: 'permissive',
    for: 'all',
    to: 'public',
    using: predicate,
    withCheck: predicate,
  });
}`;

function policyHelper(tree, anchor, origin) {
  const file = `${SCHEMA_DIR}sponsors.ts`;
  if (
    origin?.file !== file ||
    origin.name !== 'sponsorTenantPolicy' ||
    anchor.sources.get(file) !== tree.sources.get(file)
  )
    return false;
  const source = tree.graph.sourceFileOf(file);
  return (
    source?.statements.some(
      statement => ts.isFunctionDeclaration(statement) && statement.getText(source) === POLICY
    ) &&
    ['sql', 'pgPolicy'].every((name, index) => {
      const imported = tree.graph.tableOf(file).imports.get(name);
      const specifier = index === 0 ? ORM : PG;
      return (
        imported?.specifier === specifier &&
        imported.imported === name &&
        tree.graph.resolveSpecifier(file, specifier).external === specifier
      );
    })
  );
}

function namedImports(statement) {
  const clause = statement.importClause;
  if (
    !clause ||
    clause.isTypeOnly ||
    clause.name ||
    !clause.namedBindings ||
    !ts.isNamedImports(clause.namedBindings) ||
    !ts.isStringLiteral(statement.moduleSpecifier) ||
    statement.attributes ||
    !clause.namedBindings.elements.length
  )
    return null;
  return clause.namedBindings.elements;
}

function importedSchemaOrigin(tree, file, specifier, imported) {
  const { files } = tree.graph.resolveSpecifier(file, specifier);
  const origins = tree.graph.resolveImport(file, specifier, imported);
  const [origin] = origins;
  if (
    files.length !== 1 ||
    origins.length !== 1 ||
    origin.file !== files[0] ||
    !origin.file?.startsWith(SCHEMA_DIR)
  )
    return null;
  return origin;
}

function registerImport(context, tree, anchor, tables, file, specifier, element) {
  const name = element.name.text;
  const imported = (element.propertyName ?? element.name).text;
  if (element.isTypeOnly || !allowedName(name) || shadowed(context, name))
    return 'shadowed builder';
  if (specifier === ORM && imported === 'relations') return 'relations declaration';
  if (
    (specifier === PG &&
      (COLUMNS.has(imported) || EXTRA.has(imported) || imported === 'pgTable')) ||
    (specifier === ORM && imported === 'sql')
  ) {
    context.builders.set(name, imported);
    return null;
  }
  if (!specifier.startsWith('./')) return 'unreviewed builder import';
  const origin = importedSchemaOrigin(tree, file, specifier, imported);
  if (!origin) return 'unproven schema import';
  if (policyHelper(tree, anchor, origin)) context.helper = name;
  else if (tables.has(originKey(origin)))
    context.importedTables.set(name, tables.get(originKey(origin)));
  else return 'unproven schema import';
  return null;
}

export function importsOf(source, tree, anchor, tables) {
  const context = {
    builders: new Map(),
    importedTables: new Map(),
    helper: null,
    local: new Map(),
  };
  for (const statement of source.statements.filter(ts.isImportDeclaration)) {
    const elements = namedImports(statement);
    if (!elements) return { reason: 'unsupported builder import' };
    for (const element of elements) {
      const reason = registerImport(
        context,
        tree,
        anchor,
        tables,
        source.fileName,
        statement.moduleSpecifier.text,
        element
      );
      if (reason) return { reason };
    }
  }
  return context;
}

function legacyIdentity(node, builder) {
  const call = node.parent;
  if (
    !TABLE_BUILDERS.has(builder) ||
    !simpleCall(call) ||
    call.expression !== node ||
    !literal(call.arguments[0])
  )
    return null;
  let declaration = call.parent;
  while (ts.isPropertyAccessExpression(declaration) || ts.isCallExpression(declaration))
    declaration = declaration.parent;
  if (!ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)) return null;
  const argument = call.arguments[1];
  const properties =
    builder === 'pgTable' && argument && ts.isObjectLiteralExpression(argument)
      ? argument.properties
      : [];
  const columns = new Set(properties.map(property => nameOf(property.name)).filter(allowedName));
  return { binding: declaration.name.text, table: { name: call.arguments[0].text, columns } };
}

/** Recover all direct legacy table and view identities using the declaring Drizzle imports. */
export function legacyTableIdentities(tree, files) {
  const tables = new Map();
  for (const file of files) {
    if (!file.startsWith(SCHEMA_DIR)) continue;
    const imports = tree.graph.tableOf(file).imports.values();
    if (
      [...imports].some(
        ({ specifier, imported }) =>
          specifier === PG && (imported === '*' || imported === 'default')
      )
    )
      return { reason: `unmodeled database identity ${file}` };
    for (const { node, binding } of analyzeScopes(tree.graph.sourceFileOf(file)).references) {
      if (binding?.specifier !== PG || !LEGACY_BUILDERS.test(binding.imported)) continue;
      const identity = legacyIdentity(node, binding.imported);
      if (!identity) return { reason: `unmodeled database identity ${file}` };
      tables.set(`${file}#${identity.binding}`, identity.table);
    }
  }
  return { tables };
}
