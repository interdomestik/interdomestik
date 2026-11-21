import ts from 'typescript';
import { TEST_SOURCE } from './manifest.mjs';
import { hasExportModifier } from './package-exports.mjs';
import { byCodeUnit } from './rules-digest.mjs';
import { aliasInitializers, aliasTarget, publicTableBindings } from './rules-schema-bindings.mjs';
import { outsideExportLoads } from './rules-schema-forwarders.mjs';
import { inScanRoots } from './sources.mjs';
import { parseSource } from './syntax.mjs';

// Record contributors before runtime precedence can hide a collision. The module
// graph remains the authority on where runtime exports come from.
function recordImport(imported, node) {
  const specifier = node.moduleSpecifier.text;
  const clause = node.importClause;
  if (clause?.name) imported.set(clause.name.text, specifier);
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) imported.set(bindings.name.text, specifier);
  if (bindings && ts.isNamedImports(bindings)) {
    for (const { name } of bindings.elements) imported.set(name.text, specifier);
  }
}

function importSpecifiers(source, add) {
  const imported = new Map();
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      recordImport(imported, node);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      imported.set(node.name.text, node.moduleReference.expression.text);
      if (hasExportModifier(node)) add(node.name.text, node.moduleReference.expression.text);
    }
  }
  return imported;
}

function recordExportDeclaration(node, importOf, stars, add) {
  const target = node.moduleSpecifier?.text;
  const clause = node.exportClause;
  if (!clause && target) stars.push(target);
  else if (clause && ts.isNamespaceExport(clause)) add(clause.name.text, target);
  else if (clause && ts.isNamedExports(clause))
    for (const { name, propertyName } of clause.elements)
      add(name.text, target ?? importOf((propertyName ?? name).text));
}

function recordPublicStatement(node, importOf, stars, add) {
  if (ts.isExportDeclaration(node)) {
    recordExportDeclaration(node, importOf, stars, add);
    return;
  }
  if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
    add('default', importOf(node.expression.text));
    return;
  }
  if (!hasExportModifier(node)) return;
  if (node.name && ts.isIdentifier(node.name)) add(node.name.text);
  if (ts.isVariableStatement(node)) {
    for (const { name } of node.declarationList.declarations)
      if (ts.isIdentifier(name)) add(name.text, importOf(name.text));
  }
}

function forwardTable(source) {
  const names = new Set();
  const stars = [];
  const edges = [];
  const add = (name, specifier) => {
    names.add(name);
    if (specifier) edges.push(specifier);
  };
  const imported = importSpecifiers(source, add);
  const aliases = aliasInitializers(source);
  const importOf = name => imported.get(aliasTarget(aliases, name)?.name);
  for (const node of source.statements) recordPublicStatement(node, importOf, stars, add);
  return { names, stars, edges, aliases };
}

const DB_INDEX = 'packages/database/src/index.ts';
const BARREL = 'packages/database/src/schema/index.ts';
const DB_IMPORT = /^@interdomestik\/database(?:\/|$)/u;

function reverseReachable(start, indexes) {
  const reached = new Set(start);
  for (const target of reached)
    for (const index of indexes) for (const from of index.get(target) ?? []) reached.add(from);
  return reached;
}

function recordForwarders(tree, file, specifiers, reverse) {
  for (const specifier of specifiers) {
    const { files } = tree.inventory.resolveSpecifier(file, specifier);
    const targets = DB_IMPORT.test(specifier) && !inScanRoots(file) ? [...files, DB_INDEX] : files;
    for (const target of targets) {
      if (!reverse.has(target)) reverse.set(target, new Set());
      reverse.get(target).add(file);
    }
  }
}

export function forwardInventory(tree, role) {
  const tables = new Map();
  const reverse = new Map();
  const outsideReverse = new Map();
  for (const [file, text] of tree.allSources) {
    const source = parseSource(file, text);
    if (source.parseDiagnostics.length) {
      const kind = inScanRoots(file) ? 'source' : 'outside source';
      return { reason: `${role}: unparseable ${kind} ${file}` };
    }
    const table = forwardTable(source);
    tables.set(file, table);
    recordForwarders(tree, file, [...table.stars, ...table.edges], reverse);
    if (!inScanRoots(file) && !TEST_SOURCE.test(file))
      recordForwarders(tree, file, outsideExportLoads(source), outsideReverse);
  }
  const schemaModules = [...tree.sources.keys()].filter(file =>
    file.startsWith('packages/database/src/schema/')
  );
  const seeds = [DB_INDEX, 'packages/database/src/schema.ts', ...schemaModules];
  for (const file of reverseReachable(seeds, [reverse]))
    if (!inScanRoots(file)) return { reason: `${role}: schema forward outside scan roots ${file}` };
  const outsideForwards = [...reverseReachable(seeds, [reverse, outsideReverse])].filter(
    file => !inScanRoots(file)
  );
  return { tables, reverse, outsideForwards };
}

function addStarContributions(counts, types, from) {
  for (const name of from.counts.keys())
    if (name !== 'default') counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const name of from.types) if (name !== 'default') types.add(name);
}

function publicContributions(tree, inventory, file, addedTypes, visited = new Set()) {
  if (visited.has(file)) return { counts: new Map(), types: new Set() };
  const table = inventory.tables.get(file);
  if (!table) return { reason: `incomplete public export inventory ${file}` };
  const stack = new Set([...visited, file]);
  const counts = new Map(
    [...table.names, ...tree.graph.tableOf(file).named.keys()].map(name => [name, 1])
  );
  const types = new Set(addedTypes.get(file));
  for (const specifier of table.edges) {
    const resolution = tree.inventory.resolveSpecifier(file, specifier);
    if (resolution.unresolved || resolution.files.length > 1)
      return { reason: `unproven public export edge ${file}` };
  }
  for (const specifier of table.stars) {
    const { files } = tree.inventory.resolveSpecifier(file, specifier);
    if (files.length !== 1) return { reason: `unproven public star ${file}` };
    const from = publicContributions(tree, inventory, files[0], addedTypes, stack);
    if (from.reason) return from;
    addStarContributions(counts, types, from);
  }
  return { counts, types };
}

const originsOf = (tree, file, name) =>
  [...new Set(tree.graph.resolveExport(file, name).map(origin => JSON.stringify(origin)))].sort(
    byCodeUnit
  );

function replacesExport(before, after, file, name, left, right) {
  if (!left.counts.has(name) || !right.counts.has(name)) return false;
  if (right.types.has(name)) return true;
  return (
    JSON.stringify(originsOf(before, file, name)) !== JSON.stringify(originsOf(after, file, name))
  );
}

function retainedExportProblem(before, after, file, left, right) {
  for (const name of left.counts.keys())
    if (!right.counts.has(name)) return `public export removed ${file}#${name}`;
  for (const name of before.graph.exportNames(file)) {
    const previous = originsOf(before, file, name);
    if (
      !previous.length ||
      previous.some(origin => JSON.parse(origin).unresolved) ||
      JSON.stringify(previous) !== JSON.stringify(originsOf(after, file, name))
    )
      return `public export origin changed ${file}#${name}`;
  }
  for (const name of after.graph.exportNames(file)) {
    const origins = after.graph.resolveExport(file, name);
    if (!origins.length || origins.some(origin => origin.unresolved))
      return `unproven public export ${file}#${name}`;
  }
  return null;
}

function publicExportProblem(before, after, initial, final, file, names, types) {
  if (!after.sources.has(file)) return `missing public forwarder ${file}`;
  const right = publicContributions(after, final, file, types);
  if (right.reason) return right.reason;
  for (const name of names)
    if (right.counts.get(name) > 1) return `public export collision ${file}#${name}`;
  if (!before.sources.has(file)) return null;
  const left = publicContributions(before, initial, file, new Map());
  if (left.reason) return left.reason;
  for (const name of names)
    if (replacesExport(before, after, file, name, left, right))
      return `public export collision ${file}#${name}`;
  return retainedExportProblem(before, after, file, left, right);
}

function aliasProblem(before, after, initial, final, file, tableBindings) {
  for (const name of before.graph.exportNames(file)) {
    const left = publicTableBindings(before.graph, initial, file, name, tableBindings);
    const right = publicTableBindings(after.graph, final, file, name, tableBindings);
    if (JSON.stringify(left) !== JSON.stringify(right))
      return `public export table binding changed ${file}#${name}`;
  }
  return null;
}

export function comparePublicExports(
  before,
  after,
  initial,
  final,
  { tableNames, types, tableBindings }
) {
  const affected = reverseReachable([BARREL, ...types.keys()], [initial.reverse, final.reverse]);
  const names = new Set(tableNames);
  for (const each of types.values()) for (const name of each) names.add(name);
  for (const file of affected) {
    const reason =
      publicExportProblem(before, after, initial, final, file, names, types) ??
      aliasProblem(before, after, initial, final, file, tableBindings);
    if (reason) return { reason };
  }
  return { affected };
}
