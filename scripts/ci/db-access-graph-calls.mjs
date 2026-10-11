import ts from 'typescript';
import { dispatchCoverage } from './db-access-coverage.mjs';
import { inspectCallChannels } from './db-access-channels.mjs';
import { externalValue } from './db-access-external.mjs';
import { BUILTIN_CALLS } from './db-access-references.mjs';
import { isFunction, unwrap } from './db-access-source.mjs';

// Call traversal consumes the same source-owned invocation descriptors as mutation/provenance.
// Returning true only means its syntax children were visited here, never that the call is safe.
export function inspectGraphCall({
  model,
  scoped,
  references,
  context,
  node,
  origin,
  stack,
  depth,
  invocation,
  inspect,
  incomplete,
  visit,
  moduleEffect,
  targets,
  externalImport,
  localImport,
}) {
  const callee = unwrap(node.expression);
  // Source-local dispatch never overrides the existing dynamic-loader prohibition.
  if (['eval', 'Function', 'require', 'createRequire'].includes(callee.getText().split('.').at(-1)))
    incomplete.push({ file: origin, reason: 'unsupported dynamic code/module loader' });
  const coverage = dispatchCoverage(scoped, node, context);
  // Shared targets include every lazy factory intermediary and actual caller/closure frame.
  // Coverage only removes an unresolved-dispatch diagnostic, never executable body work.
  for (const alternative of coverage.alternatives)
    for (const target of alternative.targets) {
      for (const intermediate of target.resolutionInvocations)
        inspect(
          intermediate.functionNode,
          origin,
          stack,
          depth + 1,
          intermediate.callNode,
          intermediate.context,
          intermediate.definingContext
        );
      inspect(
        target.functionNode,
        origin,
        stack,
        depth + 1,
        target.callNode,
        target.context,
        target.definingContext
      );
    }
  if (coverage.covered) {
    for (const alternative of coverage.alternatives)
      if (alternative.kind === 'canonical-tx')
        inspectCallChannels(
          model,
          scoped.forContext(alternative.context),
          node.expression,
          node.arguments,
          node,
          origin,
          incomplete,
          node
        );
    // Preserve executable callback/container edges even if a source-local callee ignores them.
    for (const arg of node.arguments) {
      const callback = references.resolve(arg);
      if (callback.unknown)
        incomplete.push({ file: origin, reason: 'unsupported callback container' });
      for (const fn of callback.functions) inspect(fn, origin, stack, depth + 1);
    }
    ts.forEachChild(node, visit);
    return true;
  }
  const resolved = references.resolve(node.expression);
  if (resolved.unknown || scoped.isMutated(node.expression))
    incomplete.push({ file: origin, reason: 'mutated executable callee' });

  if (
    !ts.isIdentifier(callee) &&
    !ts.isPropertyAccessExpression(callee) &&
    callee.kind !== ts.SyntaxKind.ImportKeyword &&
    !resolved.functions.length
  )
    incomplete.push({ file: origin, reason: 'unsupported callee form' });

  if (node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0]))
    moduleEffect(node.arguments[0]);
  if (scoped.canonical(node.expression)) {
    const callback = node.arguments[1];
    if (!callback || !isFunction(callback) || callback.asteriskToken)
      incomplete.push({ file: origin, reason: 'unsupported tenant callback' });
    else inspect(callback, origin, stack, depth + 1);
    // Context object is executable, too.
    if (node.arguments[0]) visit(node.arguments[0]);
    return true;
  }
  if (
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    !ts.isStringLiteral(node.arguments[0])
  ) {
    incomplete.push({ file: origin, reason: 'nonliteral dynamic import' });
    return true;
  }
  const calledTargets = targets(node.expression);
  const called = calledTargets.length > 0;
  if (called) for (const fn of calledTargets) inspect(fn, origin, stack, depth + 1, node);
  else if (
    model.declaration(node.expression) &&
    ts.isParameter(model.declaration(node.expression)) &&
    !externalValue(model, node.expression, scoped)
  ) {
    incomplete.push({ file: origin, reason: 'unsupported received executable callback' });
  } else if (
    localImport(node.expression) &&
    !model.externalBinding(node.expression) &&
    !externalValue(model, node.expression, scoped)
  )
    incomplete.push({
      file: origin,
      reason: `unresolved local edge ${node.expression.getText()}`,
    });
  else if (
    ts.isIdentifier(node.expression) &&
    !externalImport(node.expression) &&
    !model.externalBinding(node.expression) &&
    !externalValue(model, node.expression, scoped) &&
    !BUILTIN_CALLS.has(node.expression.text)
  ) {
    incomplete.push({
      file: origin,
      reason: `unknown executable edge ${node.expression.getText()}`,
    });
  }
  // Named/forwarded callbacks are executable edges too, not merely inline arrows.
  for (const arg of node.arguments) {
    const callback = references.resolve(arg);
    if (callback.unknown)
      incomplete.push({ file: origin, reason: 'unsupported callback container' });
    for (const fn of callback.functions) inspect(fn, origin, stack, depth + 1);
    if (
      ts.isIdentifier(arg) &&
      model.declaration(arg) &&
      ts.isParameter(model.declaration(arg)) &&
      !called &&
      !model.isQueryOperator(node.expression) &&
      scoped.provenance(arg) !== 'tenant-context'
    )
      incomplete.push({ file: origin, reason: 'unsupported forwarded callback/value' });
  }
  if (!called)
    inspectCallChannels(
      model,
      scoped,
      callee,
      node.arguments,
      invocation,
      origin,
      incomplete,
      node
    );
  return false;
}
