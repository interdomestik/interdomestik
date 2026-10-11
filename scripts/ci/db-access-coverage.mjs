import ts from 'typescript';
import { canonicalQueryChain } from './db-access-inventory.mjs';
import { unwrap } from './db-access-source.mjs';

export function callForExpression(raw) {
  let node = unwrap(raw);
  while (
    node?.parent &&
    (ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) &&
    node.parent.expression === node
  )
    node = node.parent;
  return node?.parent && ts.isCallExpression(node.parent) && unwrap(node.parent.expression) === node
    ? node.parent
    : undefined;
}
// Fail closed: anything neither canonical nor fully source-resolved stays unknown-ambient.
function alternativeKind(canonical, result) {
  if (canonical) return 'canonical-tx';
  return !result.unknown && result.targets.length ? 'source-local' : 'unknown-ambient';
}
// Each actual alternative must be covered independently. No union becomes tenant-context merely
// because one caller has a transaction; local bodies remain executable graph work.
export function dispatchCoverage(provenance, call, context) {
  if (!provenance.dispatch || !call) return { covered: false, alternatives: [] };
  const alternatives = provenance.dispatch.variants(call, context).map(result => {
    const scoped = provenance.forContext ? provenance.forContext(result.context) : provenance;
    const canonical = canonicalQueryChain(call.expression, scoped);
    return { ...result, kind: alternativeKind(canonical, result) };
  });
  return {
    covered: alternatives.length > 0 && alternatives.every(item => item.kind !== 'unknown-ambient'),
    alternatives,
  };
}
