import ts from 'typescript';
import { dispatchCoverage } from './db-access-coverage.mjs';
import { inspectCallChannels } from './db-access-channels.mjs';
import { externalValue } from './db-access-external.mjs';
import { BUILTIN_CALLS } from './db-access-references.mjs';
import { isFunction, unwrap } from './db-access-source.mjs';

const DYNAMIC_LOADERS = ['eval', 'Function', 'require', 'createRequire'];

// Shared targets include every lazy factory intermediary and actual caller/closure frame.
// Coverage only removes an unresolved-dispatch diagnostic, never executable body work.
function inspectAlternativeBodies({ origin, stack, depth, inspect }, coverage) {
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
}

// Named/forwarded callbacks are executable edges too, not merely inline arrows.
function inspectArgumentCallback({ references, origin, stack, depth, inspect, incomplete }, arg) {
  const callback = references.resolve(arg);
  if (callback.unknown) incomplete.push({ file: origin, reason: 'unsupported callback container' });
  for (const fn of callback.functions) inspect(fn, origin, stack, depth + 1);
}

function inspectCoveredCall(params, coverage) {
  const { model, scoped, node, origin, incomplete, visit } = params;
  for (const alternative of coverage.alternatives)
    if (alternative.kind === 'canonical-tx')
      inspectCallChannels(
        model,
        scoped.forContext(alternative.context),
        { callee: node.expression, args: node.arguments, invocation: node, call: node },
        origin,
        incomplete
      );
  // Preserve executable callback/container edges even if a source-local callee ignores them.
  for (const arg of node.arguments) inspectArgumentCallback(params, arg);
  ts.forEachChild(node, visit);
  return true;
}

function calleeDiagnostics({ scoped, node, origin, incomplete }, callee, resolved) {
  if (resolved.unknown || scoped.isMutated(node.expression))
    incomplete.push({ file: origin, reason: 'mutated executable callee' });
  if (
    !ts.isIdentifier(callee) &&
    !ts.isPropertyAccessExpression(callee) &&
    callee.kind !== ts.SyntaxKind.ImportKeyword &&
    !resolved.functions.length
  )
    incomplete.push({ file: origin, reason: 'unsupported callee form' });
}

function inspectCanonicalCallback({ node, origin, stack, depth, inspect, incomplete, visit }) {
  const callback = node.arguments[1];
  if (!callback || !isFunction(callback) || callback.asteriskToken)
    incomplete.push({ file: origin, reason: 'unsupported tenant callback' });
  else inspect(callback, origin, stack, depth + 1);
  // Context object is executable, too.
  if (node.arguments[0]) visit(node.arguments[0]);
  return true;
}

function unresolvedEdgeDiagnostic(params) {
  const { model, scoped, node, origin, incomplete, externalImport, localImport } = params;
  if (
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
}

function forwardedArgumentDiagnostic({ model, scoped, node, origin, incomplete }, arg, called) {
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

// Call traversal consumes the same source-owned invocation descriptors as mutation/provenance.
// Returning true only means its syntax children were visited here, never that the call is safe.
// Phases run in their original order, so every inspect call and incomplete push keeps its place.
export function inspectGraphCall(params) {
  const { model, scoped, references, context, node, origin, stack, depth, invocation } = params;
  const { inspect, incomplete, moduleEffect, targets } = params;
  const callee = unwrap(node.expression);
  // Source-local dispatch never overrides the existing dynamic-loader prohibition.
  if (DYNAMIC_LOADERS.includes(callee.getText().split('.').at(-1)))
    incomplete.push({ file: origin, reason: 'unsupported dynamic code/module loader' });
  const coverage = dispatchCoverage(scoped, node, context);
  inspectAlternativeBodies(params, coverage);
  if (coverage.covered) return inspectCoveredCall(params, coverage);
  const resolved = references.resolve(node.expression);
  calleeDiagnostics(params, callee, resolved);
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0]))
    moduleEffect(node.arguments[0]);
  if (scoped.canonical(node.expression)) return inspectCanonicalCallback(params);
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
  else unresolvedEdgeDiagnostic(params);
  for (const arg of node.arguments) {
    inspectArgumentCallback(params, arg);
    forwardedArgumentDiagnostic(params, arg, called);
  }
  if (!called)
    inspectCallChannels(
      model,
      scoped,
      { callee, args: node.arguments, invocation, call: node },
      origin,
      incomplete
    );
  return false;
}
