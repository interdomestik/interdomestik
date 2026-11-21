// Check retained callers for selections the new table bindings would change.

import ts from 'typescript';
import { TEST_SOURCE } from './manifest.mjs';
import { CLIENT, DATA, DB, DB_EXPORTS } from './schema-query-origins.mjs';
import { queryReceiverOrigins } from './schema-query-values.mjs';
import { analyzeScopes, collectUnits, fingerprint, parseSource, unitOf } from './syntax.mjs';

const OWNER_KEYS = 'apps/web/src/lib/safe-action.owner-keys.ts';
const ANCHORED_CONSUMERS = new Set([DB, OWNER_KEYS]);

function selection(node, receiver) {
  if (ts.isPropertyAccessExpression(node) && node.expression === receiver) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.expression === receiver &&
    ts.isStringLiteral(node.argumentExpression)
  )
    return node.argumentExpression.text;
  return null;
}

export function retainedConsumerProblem(before, after, anchor, affected, names) {
  const receiverOrigin = queryReceiverOrigins(after);
  for (const [file, text] of after.allSources) {
    const previous = before.allSources.get(file);
    if (previous === undefined || TEST_SOURCE.test(file)) continue;
    const source = after.inventory.sourceFileOf(file);
    const retained = retainedUnits(previous, source);
    if (
      unprovenQuerySelections(source, names, retained, receiverOrigin).length ||
      !namespaceSelectionsSafe(after, anchor, file, source, affected, names, retained)
    )
      return `unproven dynamic schema consumer ${file}`;
  }
  return null;
}

function retainedUnits(previous, source) {
  if (previous === source.text) return () => true;
  const old = parseSource(source.fileName, previous);
  const prints = new Set(collectUnits(old).map(unit => fingerprint(unit, old)));
  const kept = new Set(collectUnits(source).filter(unit => prints.has(fingerprint(unit, source))));
  return node => kept.has(unitOf(node));
}

export function unprovenQuerySelections(source, names, retained, receiverOrigin) {
  const problems = [];
  const visit = node => {
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      selection(node, node.expression) === 'query' &&
      retained(node)
    ) {
      const origin = receiverOrigin(node.expression);
      const key = selection(node.parent, node);
      if (origin !== DATA && (origin !== CLIENT || !key || names.has(key))) problems.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

function namespaceKeySafe(node, names) {
  const key = selection(node.parent, node);
  return key !== null && !names.has(key);
}

function importedSelectionSafe(graph, file, node, binding, affected, names) {
  const targets = graph.resolveSpecifier(file, binding.specifier).files;
  const targetsSchema = targets.some(target => affected.has(target));
  if (binding.imported === '*' || binding.imported === 'default')
    return !targetsSchema || namespaceKeySafe(node, names);
  if (targetsSchema && names.has(binding.imported)) return false;
  const origins = graph.resolveImport(file, binding.specifier, binding.imported);
  if (
    origins.some(origin => origin.file === DB && DB_EXPORTS.has(origin.name)) &&
    selection(node.parent, node) === 'query'
  )
    return selection(node.parent.parent, node.parent) !== null;
  const forwardsNamespace = origins.some(origin =>
    origin.namespace?.some(target => affected.has(target))
  );
  return !forwardsNamespace || namespaceKeySafe(node, names);
}

function namespaceSelectionsSafe(tree, anchor, file, source, affected, names, retained) {
  if (ANCHORED_CONSUMERS.has(file) && anchor.sources.get(file) === source.text) return true;
  return analyzeScopes(source).references.every(({ node, binding }) => {
    if (binding?.kind !== 'import' || !binding.specifier || !retained(node)) return true;
    return importedSelectionSafe(tree.inventory, file, node, binding, affected, names);
  });
}
