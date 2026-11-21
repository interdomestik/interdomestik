// Closed grammar for new Drizzle tables and read-only references.
// Columns outside COLUMNS (including enum columns), relations(), edits to existing tables,
// and mid-barrel insertions require an exact reviewed transition.

import ts from 'typescript';
import {
  allowedName,
  COLUMNS,
  builderLoaderProblem,
  importsOf,
  INDEXES,
  INFERRED_TYPES,
  literal,
  nameOf,
  shadowed,
  simpleCall,
} from './schema-builder-imports.mjs';

const COLUMN_METHODS = new Set(['primaryKey', 'notNull', 'unique', 'defaultNow', 'defaultRandom']);
const DATA_KEYWORDS = new Set([
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
]);
const POLICY_STRINGS = new Set(['as', 'for', 'to']);
const POLICY_PREDICATES = new Set(['using', 'withCheck']);

function propertyMap(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  const result = new Map();
  for (const property of node.properties) {
    const key = nameOf(property.name);
    if (!ts.isPropertyAssignment(property) || !allowedName(key) || result.has(key)) return null;
    result.set(key, property.initializer);
  }
  return result;
}

function data(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || DATA_KEYWORDS.has(node.kind))
    return true;
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(data);
  const fields = propertyMap(node);
  return fields !== null && [...fields.values()].every(data);
}

// Only a fresh root call and subsequent methods on that same expression form a receiver.
function chain(node, context, root, method) {
  if (!simpleCall(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return root(context.builders.get(callee.text), node.arguments);
  return (
    ts.isPropertyAccessExpression(callee) &&
    !callee.questionDotToken &&
    method(callee.name.text, node.arguments) &&
    chain(callee.expression, context, root, method)
  );
}

function arrow(node, arity) {
  return (
    node &&
    ts.isArrowFunction(node) &&
    !node.modifiers &&
    !node.typeParameters &&
    !node.type &&
    node.parameters.length === arity &&
    node.parameters.every(
      parameter =>
        ts.isIdentifier(parameter.name) &&
        !parameter.type &&
        !parameter.initializer &&
        !parameter.dotDotDotToken &&
        !parameter.questionToken
    ) &&
    !ts.isBlock(node.body)
  );
}

function referencedTable(node, context, own, readable) {
  if (
    !node ||
    !ts.isPropertyAccessExpression(node) ||
    node.questionDotToken ||
    !ts.isIdentifier(node.expression)
  )
    return null;
  const receiver = node.expression.text;
  let table = own;
  if (receiver !== own?.param) {
    if (!readable) return null;
    table = context.local.get(receiver) ?? context.importedTables.get(receiver);
  }
  return table?.columns.has(node.name.text) ? table : null;
}

function freshColumn(node, context) {
  return chain(
    node,
    context,
    (name, args) =>
      COLUMNS.has(name) &&
      args.length >= 1 &&
      args.length <= 2 &&
      literal(args[0]) &&
      (args.length === 1 || data(args[1])),
    (method, args) => {
      if (COLUMN_METHODS.has(method)) return args.length === 0;
      if (method === 'default') return args.length === 1 && data(args[0]);
      if (method !== 'references' || args.length !== 1 || !arrow(args[0], 0)) return false;
      return referencedTable(args[0].body, context, null, true);
    }
  );
}

function sqlTemplate(node, context, own) {
  return (
    node &&
    ts.isTaggedTemplateExpression(node) &&
    !node.typeArguments &&
    ts.isIdentifier(node.tag) &&
    context.builders.get(node.tag.text) === 'sql' &&
    (ts.isNoSubstitutionTemplateLiteral(node.template) ||
      node.template.templateSpans.every(span =>
        referencedTable(span.expression, context, own, false)
      ))
  );
}

function foreignKeyArgument(node, context, own) {
  const fields = propertyMap(node);
  if (!fields || fields.size !== 3 || !literal(fields.get('name'))) return false;
  const columns = fields.get('columns');
  const foreign = fields.get('foreignColumns');
  if (
    !columns ||
    !foreign ||
    !ts.isArrayLiteralExpression(columns) ||
    !ts.isArrayLiteralExpression(foreign) ||
    !columns.elements.length ||
    columns.elements.length !== foreign.elements.length
  )
    return false;
  const to = foreign.elements.map(element => referencedTable(element, context, own, true));
  return (
    columns.elements.every(element => referencedTable(element, context, own, false)) &&
    Boolean(to[0]) &&
    to.every(table => table === to[0])
  );
}

function policyFieldsSafe(node, context, own) {
  const fields = propertyMap(node);
  return (
    fields &&
    [...fields].every(
      ([key, value]) =>
        (POLICY_STRINGS.has(key) && ts.isStringLiteral(value)) ||
        (POLICY_PREDICATES.has(key) && sqlTemplate(value, context, own))
    )
  );
}

function indexBuilder(node, context, own) {
  const callee = node.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.name.text !== 'on' ||
    callee.questionDotToken
  )
    return false;
  const root = callee.expression;
  return (
    simpleCall(root) &&
    ts.isIdentifier(root.expression) &&
    INDEXES.has(context.builders.get(root.expression.text)) &&
    root.arguments.length === 1 &&
    literal(root.arguments[0]) &&
    node.arguments.length > 0 &&
    node.arguments.every(arg => referencedTable(arg, context, own, false))
  );
}

function extraBuilder(node, context, own) {
  if (!simpleCall(node)) return false;
  if (!ts.isIdentifier(node.expression)) return indexBuilder(node, context, own);
  const [first, second] = node.arguments;
  const name = context.builders.get(node.expression.text);
  if (name === 'foreignKey')
    return node.arguments.length === 1 && foreignKeyArgument(first, context, own);
  if (node.arguments.length !== 2 || !literal(first)) return false;
  if (node.expression.text === context.helper) return referencedTable(second, context, own, false);
  if (name === 'check') return sqlTemplate(second, context, own);
  return name === 'pgPolicy' && policyFieldsSafe(second, context, own);
}

function freshTable(node, context) {
  let identity;
  const allowed = chain(
    node,
    context,
    (builder, args) => {
      if (builder !== 'pgTable' || args.length < 2 || args.length > 3 || !literal(args[0]))
        return false;
      const columns = propertyMap(args[1]);
      if (!columns?.size || ![...columns.values()].every(value => freshColumn(value, context)))
        return false;
      identity = { name: args[0].text, columns: new Set(columns.keys()) };
      if (args.length === 2) return true;
      const callback = args[2];
      if (!arrow(callback, 1) || !ts.isArrayLiteralExpression(callback.body)) return false;
      const param = callback.parameters[0].name.text;
      if (shadowed(context, param)) return 'shadowed builder';
      return callback.body.elements.every(element =>
        extraBuilder(element, context, { ...identity, param })
      );
    },
    (method, args) => method === 'enableRLS' && args.length === 0
  );
  if (typeof allowed === 'string') return allowed;
  return allowed ? identity : null;
}

const onlyExportModifier = node =>
  node.modifiers?.length === 1 && node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword;

function registerTables(statement, context) {
  if (
    !ts.isVariableStatement(statement) ||
    !(statement.declarationList.flags & ts.NodeFlags.Const) ||
    !onlyExportModifier(statement)
  )
    return 'unsupported module statement';
  for (const declaration of statement.declarationList.declarations) {
    const key = ts.isIdentifier(declaration.name) ? declaration.name.text : null;
    if (!allowedName(key) || declaration.type || !declaration.initializer || shadowed(context, key))
      return 'shadowed builder';
    const result = freshTable(declaration.initializer, context);
    if (typeof result === 'string') return result;
    if (!result) return 'unowned builder receiver';
    context.local.set(key, result);
  }
  return null;
}

function inferredTypeNames(aliases, context) {
  const names = new Set();
  for (const alias of aliases) {
    const { name, type } = alias;
    if (
      !onlyExportModifier(alias) ||
      alias.typeParameters ||
      !ts.isTypeQueryNode(type) ||
      type.typeArguments ||
      context.local.has(name.text) ||
      names.has(name.text)
    )
      return null;
    const query = type.exprName;
    if (
      !ts.isQualifiedName(query) ||
      !ts.isIdentifier(query.left) ||
      !context.local.has(query.left.text) ||
      !INFERRED_TYPES.has(query.right.text)
    )
      return null;
    names.add(name.text);
  }
  return names;
}

/** Admit imports, fresh exported tables and their erased select/insert aliases. */
export function proveBuilderModule(tree, anchor, file, tables) {
  const source = tree.graph.sourceFileOf(file);
  const failure = builderLoaderProblem(source);
  if (failure) return { reason: failure };
  const context = importsOf(source, tree, anchor, tables);
  if (context.reason) return context;
  const aliases = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isTypeAliasDeclaration(statement)) {
      aliases.push(statement);
      continue;
    }
    const reason = registerTables(statement, context);
    if (reason) return { reason };
  }
  const types = inferredTypeNames(aliases, context);
  if (!types) return { reason: 'unsupported module statement' };
  return {
    types,
    tables: new Map([...context.local].map(([name, identity]) => [`${file}#${name}`, identity])),
  };
}
