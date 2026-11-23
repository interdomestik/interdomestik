import path from 'node:path/posix';
import ts from 'typescript';
import { hasExportModifier } from './package-exports.mjs';
import { pathRuleMatch } from './resolution.mjs';
import { loaderArgument } from './rules-schema-forwarders.mjs';
import { SCHEMA_DIR } from './schema-builder-imports.mjs';
import { bindingPath, createQueryOrigins, memberKey, outerValue } from './schema-query-origins.mjs';
import { isNonReference } from './scopes.mjs';

const DB_DIR = path.dirname(SCHEMA_DIR);
const DB_PACKAGE = '@interdomestik/database';
const SCHEMA_ENTRIES = new Set([DB_DIR, `${DB_DIR}/index`, `${DB_DIR}/schema`]);
const STAR_EXPORTS = Symbol('star exports');
const isSchemaSource = file =>
  file.startsWith(SCHEMA_DIR) || file === `${DB_DIR}/index.ts` || file === `${DB_DIR}/schema.ts`;
const isSchemaPath = file =>
  isSchemaSource(file) || SCHEMA_ENTRIES.has(file.replace(/\.[cm]?[jt]sx?$/u, ''));

export function destructuringInitializers(source) {
  return source.statements
    .filter(node => ts.isVariableStatement(node) && hasExportModifier(node))
    .flatMap(node =>
      node.declarationList.declarations.filter(
        declaration => declaration.initializer && ts.isBindingPattern(declaration.name)
      )
    );
}

function namedSchemaSource(tree, from, specifier) {
  if (specifier.startsWith('.')) return isSchemaPath(path.join(path.dirname(from), specifier));
  if (specifier === DB_PACKAGE || specifier.startsWith(`${DB_PACKAGE}/`))
    return isSchemaPath(path.join(DB_DIR, specifier.slice(DB_PACKAGE.length)));
  return tree.resolution.pathRules.some(({ pattern, targets }) => {
    const match = pathRuleMatch(pattern, specifier);
    return (
      match !== null &&
      targets.some(target => isSchemaPath(path.normalize(target.replaceAll('*', () => match))))
    );
  });
}

function readImport(reader, from, specifier, name, members) {
  const { files } = reader.env.graph.resolveSpecifier(from, specifier);
  if (files.length === 0) return namedSchemaSource(reader.tree, from, specifier);
  const [first, ...rest] = members;
  const selecting = name === '*' && first !== undefined;
  return files.some(
    file =>
      isSchemaSource(file) ||
      reader.readExport(file, selecting ? first : name, selecting ? rest : members)
  );
}

function readExportEntry(reader, file, entry, members) {
  if (entry.kind === 'namespace') return readImport(reader, file, entry.specifier, '*', members);
  if (entry.kind === 'reexport')
    return readImport(reader, file, entry.specifier, entry.name, members);
  if (entry.kind === 'local')
    return readBinding(reader, reader.env.local(file, entry.local), members);
  const assignment = reader.env.graph.sourceFileOf(file)?.statements.find(ts.isExportAssignment);
  return reader.readExpression(assignment?.expression, members);
}

function readExport(reader, file, name, members) {
  // Keep the owner of each edge so an unresolved relative specifier is still meaningful.
  const { named, stars } = reader.env.graph.tableOf(file);
  const entry = named.get(name);
  if (entry) return readExportEntry(reader, file, entry, members);
  if (name === 'default') return false;
  if (name === '*' || name === STAR_EXPORTS) {
    if (
      [...named.keys()].some(
        key => (key !== 'default' || name === '*') && reader.readExport(file, key, members)
      )
    )
      return true;
    name = STAR_EXPORTS;
  }
  return stars.some(specifier => readImport(reader, file, specifier, name, members));
}

function assignedValue(reference) {
  const value = outerValue(reference);
  const { parent } = value;
  return ts.isBinaryExpression(parent) &&
    parent.left === value &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ? parent.right
    : undefined;
}

function readBinding(reader, binding, members) {
  if (!binding) return false;
  if (binding.kind === 'import')
    return (
      Boolean(binding.specifier) &&
      readImport(
        reader,
        binding.id.getSourceFile().fileName,
        binding.specifier,
        binding.imported,
        members
      )
    );
  if (binding.kind !== 'var') return false;
  const prefix = bindingPath(binding.id) ?? [];
  return (
    reader.readExpression(binding.decl.initializer, [...prefix, ...members]) ||
    reader.env.uses(binding).some(ref => reader.readExpression(assignedValue(ref), members))
  );
}

function loadNamesSchema(reader, node, argument, members) {
  const callee = ts.skipOuterExpressions(node.expression);
  if (ts.isIdentifier(callee) && reader.env.lookup(callee)) return false;
  const file = node.getSourceFile().fileName;
  if (ts.isStringLiteralLike(argument))
    return readImport(reader, file, argument.text, '*', members);
  const namesSource = value => {
    if (ts.isStringLiteralLike(value) || ts.isTemplateLiteralToken(value))
      return namedSchemaSource(reader.tree, file, value.text);
    return Boolean(ts.forEachChild(value, child => namesSource(child) || undefined));
  };
  return namesSource(argument);
}

function readExpression(reader, node, members) {
  if (ts.isIdentifier(node))
    return !isNonReference(node) && readBinding(reader, reader.env.lookup(node), members);
  if (ts.isTypeNode(node)) return false;
  if (ts.isAwaitExpression(node)) return reader.readExpression(node.expression, members);
  const key = memberKey(node);
  if (key !== null) return reader.readExpression(node.expression, [key, ...members]);
  const argument = loaderArgument(node);
  if (argument && loadNamesSchema(reader, node, argument, members)) return true;
  // An expression without a static resolution still refuses if it names a schema source.
  return Boolean(ts.forEachChild(node, child => reader.readExpression(child) || undefined));
}

function namesSchema(tree, env, initializer) {
  const active = new Set();
  const visit = (key, read) => {
    if (active.has(key)) return false;
    active.add(key);
    const result = read();
    active.delete(key);
    return result;
  };
  const reader = {
    tree,
    env,
    readExport: (file, name, members) =>
      visit(`${file}#${String(name)}`, () => readExport(reader, file, name, members)),
    readExpression(node, members = []) {
      if (!node) return false;
      const value = ts.skipOuterExpressions(node);
      return visit(value, () => readExpression(reader, value, members));
    },
  };
  return reader.readExpression(initializer);
}

export function* schemaDestructuringExports(tree, inventory) {
  const env = createQueryOrigins(tree);
  for (const declaration of inventory.destructuring)
    if (namesSchema(tree, env, declaration.initializer)) yield declaration;
}
