import ts from 'typescript';
import { importedInvocation } from './db-access-invocation-imports.mjs';
import { unwrap } from './db-access-source.mjs';
import {
  createFrame,
  createValueEvaluator,
  rootEnv,
  usesThis,
} from './db-access-invocation-values.mjs';
import { createInvocationContexts } from './db-access-invocation-contexts.mjs';

// Source-owned invocation resolver consumed by shared dispatch evidence. It identifies local
// callables with exact argument/closure bindings and finite synchronous factory/self-return
// invocations. Resolved targets are never certified safe or tenant-context: consumers inspect
// every target and intermediary body, argument and return. Generic cross-module resolution stays
// unknown; the optional sourceReferences adapter admits only authenticated direct value imports.
// Unknown, async/awaited factory returns, generators, classes, accessors, dynamic and recursive
// shapes stay unknown regardless of file name.
//
// resolveCall(call) -> { functions, unknown, reasons, targets }. A target has functionNode,
// callNode, receiverNode, argumentBindings (own parameter -> actual argument), closureBindings
// (parameter -> actual argument of every invocation frame lexically enclosing functionNode; the
// call site's own enclosing functions are open, so their parameters remain the consumer's own
// context and are never filled from another call) and resolutionInvocations, in resolution-demand
// order: { functionNode, callNode, argumentBindings, closureBindings } per intermediary invocation.
// Argument expressions are exposed unevaluated unless a resolved value flows through them.
// resolveCallable(expression) -> { functions, unknown, reasons } has no place for invocation
// evidence, so a callable that needs any intermediary invocation is unknown with
// 'requires-invocation-context'; resolveCall supplies those contexts.

export function createLocalInvocations(
  model,
  { isMutated, isEscaped, maxSteps = 512, sourceReferences } = {}
) {
  if (!model?.parsed || typeof model.symbol !== 'function')
    throw new TypeError('createLocalInvocations requires a source model');
  if (typeof isMutated !== 'function' || typeof isEscaped !== 'function')
    throw new TypeError(
      'createLocalInvocations requires explicit isMutated and isEscaped callbacks'
    );
  if (!Number.isInteger(maxSteps) || maxSteps < 1)
    throw new TypeError('maxSteps must be a positive integer');
  const frames = createInvocationContexts(model, createFrame);
  const values = createValueEvaluator(model, {
    isMutated,
    isEscaped,
    maxSteps,
    registerInvocation: frames.register,
  });

  function report(ctx, fn) {
    if (fn && usesThis(fn)) values.fail(ctx, 'this-dependent');
    if (!fn && !ctx.reasons.length) values.fail(ctx, 'unresolved');
    return {
      functions: fn ? [fn] : [],
      unknown: ctx.reasons.length > 0,
      reasons: [...ctx.reasons],
    };
  }
  function resolveCallable(expression) {
    const ctx = values.context();
    let value = expression
      ? values.evaluate(ctx, expression, rootEnv(expression), 'fn')
      : values.fail(ctx, 'missing-expression');
    if (value && ctx.invocations.length) value = values.fail(ctx, 'requires-invocation-context');
    return report(ctx, value?.node);
  }
  function resolveCall(call, callerContext) {
    const ctx = values.context();
    let value;
    const env =
      callerContext === undefined ? call && rootEnv(call) : frames.lookup(callerContext, call);
    if (callerContext !== undefined && !env) values.fail(ctx, 'invalid-caller-context');
    if (!call || !ts.isCallExpression(call)) values.fail(ctx, 'not-call-expression');
    else if (call.questionDotToken) values.fail(ctx, 'optional-call');
    else if (!ctx.reasons.length) value = values.evaluate(ctx, call.expression, env, 'fn');
    const argumentBindings = value && values.bindArguments(ctx, value.node, call);
    const result = report(ctx, value?.node);
    if (result.unknown)
      return (
        importedInvocation(
          model,
          {
            references: sourceReferences,
            frames,
            values,
            isMutated,
            isEscaped,
          },
          call,
          callerContext
        ) ?? { ...result, targets: [] }
      );
    const callee = unwrap(call.expression);
    const member = ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee);
    const { descriptor } = frames.register(value, call, env, argumentBindings, ctx.running);
    const target = {
      ...descriptor,
      receiverNode: member ? callee.expression : undefined,
      resolutionInvocations: [...ctx.invocations],
    };
    return { ...result, targets: [target] };
  }
  return Object.freeze({ resolveCallable, resolveCall, bindingsFor: frames.bindingsFor });
}
