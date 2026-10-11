import ts from 'typescript';
import { createResolutionMemo } from './db-access-invocation-memo.mjs';
import { isFunction, ownerOf, unwrap } from './db-access-source.mjs';
import {
  kindName,
  memberKey,
  objectShape,
  ownReturns,
  propertyKey,
  usesThis,
} from './db-access-invocation-shapes.mjs';

export { kindName, usesThis };

// Stage 2 bounded source-value evaluation, used only by db-access-invocations.mjs. It never runs
// source code and never infers purity, safety or tenant context. A value is either a source-local
// function { kind: 'fn', node, env } or an own object-literal allocation { kind: 'obj', node, env },
// where env is the lexical frame chain that produced it. Each resolution gets open frames for the
// call site's own enclosing functions (their parameters stay unbound) and a fresh frame for every
// source-known invocation holding its exact argument expressions. Const locals and parameters are
// memoised per frame within one resolution context: a self-returning `chain` keeps its allocation
// identity, while a repeated factory call never reuses an earlier call's bindings. A frame reached
// again through a retained context token recomputes its locals in the new resolution context, so
// every escape/mutation query, intermediary invocation, step and failure reason is re-exposed
// exactly as a fresh frame would expose it. Every invocation used to produce a value is recorded
// so consumers must traverse its body, arguments and return. Anything else is unknown.

const role = mode => (mode === 'obj' ? 'receiver' : 'callee');
const FACTORY_KINDS = [
  ts.isFunctionDeclaration,
  ts.isFunctionExpression,
  ts.isArrowFunction,
  ts.isMethodDeclaration,
];

export const createFrame = (owner, parent, invocation = {}) => ({
  owner,
  parent,
  locals: new Map(),
  ...invocation,
});

// Exact parameter -> argument bindings of every invocation frame lexically enclosing a value.
// Open call-site frames contribute none; frames nest lexically, so no parameter is overwritten.
export function closureOf(env) {
  const bindings = new Map();
  for (let frame = env; frame; frame = frame.parent)
    for (const [parameter, argument] of frame.bindings ?? [])
      if (!bindings.has(parameter)) bindings.set(parameter, argument);
  return bindings;
}

// Open frames for an expression's own lexical owners, source file outermost.
export function rootEnv(node) {
  const owners = [];
  for (let owner = ownerOf(node.parent ?? node); ; owner = ownerOf(owner.parent)) {
    owners.unshift(owner);
    if (!owner.parent) break;
  }
  return owners.reduce((parent, owner) => createFrame(owner, parent), undefined);
}

export function createValueEvaluator(
  model,
  { isMutated, isEscaped, maxSteps, registerInvocation }
) {
  const parsedFiles = new Set(model.parsed.values());
  const { nextGeneration, memo } = createResolutionMemo(fail);
  const context = () => ({
    generation: nextGeneration(),
    steps: 0,
    reasons: [],
    active: new Map(),
    running: new Map(),
    invocations: [],
  });

  function fail(ctx, reason) {
    if (!ctx.reasons.includes(reason)) ctx.reasons.push(reason);
    return undefined;
  }
  function unsafe(ctx, node) {
    const reason = isMutated(node) ? 'mutated' : isEscaped(node) ? 'escaped' : undefined;
    if (reason) fail(ctx, `${reason}:${kindName(node)}`);
    return Boolean(reason);
  }
  function functionValue(ctx, fn, env) {
    if (!isFunction(fn) || !parsedFiles.has(fn.getSourceFile()))
      return fail(ctx, 'not-source-function');
    return unsafe(ctx, fn) ? undefined : { kind: 'fn', node: fn, env };
  }
  function localDeclaration(ctx, node) {
    const declarations = model.symbol(node)?.declarations ?? [];
    if (!declarations.length) return fail(ctx, 'unresolved-symbol');
    const bodies = declarations.filter(item => ts.isFunctionDeclaration(item) && item.body);
    const overloads = declarations.every(item => ts.isFunctionDeclaration(item));
    const decl =
      overloads && bodies.length === 1
        ? bodies[0]
        : declarations.length === 1
          ? declarations[0]
          : undefined;
    if (!decl) return fail(ctx, 'ambiguous-declaration');
    const file = decl.getSourceFile();
    if (file !== node.getSourceFile() || !parsedFiles.has(file))
      return fail(ctx, 'cross-module-binding');
    return decl;
  }
  function constInitializer(ctx, decl) {
    const flags = ts.getCombinedNodeFlags(decl) & ts.NodeFlags.BlockScoped;
    if (flags !== ts.NodeFlags.Const) return fail(ctx, 'mutable-binding');
    if (!decl.initializer) return fail(ctx, 'missing-initializer');
    return unsafe(ctx, decl.name) ? undefined : decl.initializer;
  }
  function ownProperty(ctx, object, key) {
    const shape = objectShape(object);
    if (shape.reason) return fail(ctx, shape.reason);
    return shape.members.get(key) ?? fail(ctx, `missing-own-property:${key}`);
  }
  function scopeFrame(ctx, env, owner) {
    for (let frame = env; frame; frame = frame.parent) if (frame.owner === owner) return frame;
    return fail(ctx, 'scope-mismatch');
  }
  function bindArguments(ctx, fn, call) {
    if (call.arguments.some(item => ts.isSpreadElement(item))) return fail(ctx, 'spread-argument');
    const simple = parameter =>
      ts.isIdentifier(parameter.name) &&
      parameter.name.text !== 'this' &&
      !parameter.dotDotDotToken &&
      !parameter.initializer;
    if (!fn.parameters.every(simple)) return fail(ctx, 'unsupported-parameter');
    if (call.arguments.length !== fn.parameters.length)
      return fail(ctx, `arity-mismatch:${call.arguments.length}/${fn.parameters.length}`);
    return new Map(fn.parameters.map((parameter, index) => [parameter, call.arguments[index]]));
  }
  // Single source-proven return of a synchronous non-generator factory. Earlier statements are
  // neither executed nor certified inert; the recorded invocation makes consumers scan them.
  function factoryReturn(ctx, fn) {
    if (!FACTORY_KINDS.some(isKind => isKind(fn)))
      return fail(ctx, `unsupported-factory:${kindName(fn)}`);
    if (fn.asteriskToken) return fail(ctx, 'generator-factory');
    if (fn.modifiers?.some(item => item.kind === ts.SyntaxKind.AsyncKeyword))
      return fail(ctx, 'async-factory');
    if (usesThis(fn)) return fail(ctx, 'this-dependent');
    if (!ts.isBlock(fn.body)) return fn.body;
    const last = fn.body.statements.at(-1);
    const returns = ownReturns(fn.body);
    if (returns.length !== 1 || returns[0] !== last || !last.expression)
      return fail(ctx, 'unsupported-return');
    return last.expression;
  }
  function evaluate(ctx, raw, env, mode) {
    const node = unwrap(raw);
    if (!node) return fail(ctx, 'missing-expression');
    ctx.steps += 1;
    if (ctx.steps > maxSteps) return fail(ctx, 'budget-exceeded');
    // The same parameter AST can be visited in distinct finite invocation frames.
    const active = ctx.active.get(env) ?? new Set();
    ctx.active.set(env, active);
    if (active.has(node)) return fail(ctx, 'cycle');
    if (unsafe(ctx, node)) return undefined;
    active.add(node);
    let value;
    try {
      value = evaluateNode(ctx, node, env, mode);
    } finally {
      active.delete(node);
    }
    if (value && value.kind !== mode)
      return fail(ctx, `unsupported-${role(mode)}:${kindName(value.node)}`);
    return value;
  }
  function evaluateNode(ctx, node, env, mode) {
    if (ts.isObjectLiteralExpression(node)) return { kind: 'obj', node, env };
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
      return functionValue(ctx, node, env);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const member = memberProperty(ctx, node, env);
      return member && propertyValue(ctx, member.item, member.env, mode);
    }
    if (ts.isCallExpression(node))
      return (
        invocationValue(ctx, node, env, mode) ??
        fail(ctx, `unsupported-${role(mode)}:CallExpression`)
      );
    if (ts.isIdentifier(node)) return identifierValue(ctx, node, env, mode);
    return fail(ctx, `unsupported-${role(mode)}:${kindName(node)}`);
  }
  function identifierValue(ctx, node, env, mode) {
    const decl = localDeclaration(ctx, node);
    if (!decl) return undefined;
    if (ts.isParameter(decl)) return parameterValue(ctx, decl, env, mode);
    const declared = ts.isFunctionDeclaration(decl);
    if (!declared && !ts.isVariableDeclaration(decl) && !ts.isBindingElement(decl)) {
      const label = mode === 'obj' ? 'receiver' : 'declaration';
      return fail(ctx, `unsupported-${label}:${kindName(decl)}`);
    }
    const scope = scopeFrame(ctx, env, ownerOf(declared ? decl.parent : decl));
    if (!scope) return undefined;
    if (declared)
      return decl.name && unsafe(ctx, decl.name) ? undefined : functionValue(ctx, decl, scope);
    return ts.isBindingElement(decl)
      ? bindingValue(ctx, decl, scope, mode)
      : declValue(ctx, decl, scope, mode);
  }
  // Stage 1 destructuring rules: a const object pattern of plain identifier own-key elements.
  function bindingValue(ctx, element, scope, mode) {
    const pattern = element.parent;
    const decl = pattern?.parent;
    if (
      !ts.isObjectBindingPattern(pattern) ||
      !decl ||
      !ts.isVariableDeclaration(decl) ||
      decl.name !== pattern ||
      element.dotDotDotToken ||
      element.initializer ||
      !ts.isIdentifier(element.name)
    )
      return fail(ctx, 'unsupported-destructuring');
    const key = propertyKey(element.propertyName ?? element.name);
    if (key === undefined) return fail(ctx, 'computed-key');
    if (unsafe(ctx, element.name)) return undefined;
    const object = declValue(ctx, decl, scope, 'obj');
    const item = object && ownProperty(ctx, object.node, key);
    return item && propertyValue(ctx, item, object.env, mode);
  }
  function declValue(ctx, decl, scope, mode) {
    return memo(ctx, scope, decl, () => {
      const initializer = constInitializer(ctx, decl);
      return initializer && evaluate(ctx, initializer, scope, mode);
    });
  }
  // A parameter of an open (call-site) frame stays unbound. A bound argument is evaluated in its
  // caller's environment with the caller's active invocation stack, once per frame and context.
  function parameterValue(ctx, parameter, env, mode) {
    const scope = scopeFrame(ctx, env, parameter.parent);
    if (!scope) return undefined;
    const argument = scope.bindings?.get(parameter);
    if (!argument) return fail(ctx, 'parameter-binding');
    if (unsafe(ctx, parameter.name)) return undefined;
    return memo(ctx, scope, parameter, () => {
      const running = ctx.running;
      ctx.running = scope.callerRunning;
      try {
        return evaluate(ctx, argument, scope.callerEnv, mode);
      } finally {
        ctx.running = running;
      }
    });
  }
  function memberProperty(ctx, node, env) {
    if (node.questionDotToken) return fail(ctx, 'optional-chain');
    const key = memberKey(node);
    if (key === undefined) return fail(ctx, 'dynamic-member-key');
    const object = evaluate(ctx, node.expression, env, 'obj');
    const item = object && ownProperty(ctx, object.node, key);
    return item && { item, env: object.env };
  }
  function propertyValue(ctx, item, env, mode) {
    if (ts.isMethodDeclaration(item)) return functionValue(ctx, item, env);
    if (ts.isPropertyAssignment(item)) return evaluate(ctx, item.initializer, env, mode);
    if (ts.isShorthandPropertyAssignment(item) && !item.objectAssignmentInitializer)
      return evaluate(ctx, item.name, env, mode);
    return fail(ctx, `unsupported-property:${kindName(item)}`);
  }
  // A source-known invocation whose single return produces the needed value. Its fresh frame keeps
  // the exact arguments; re-entering the same function and defining frame fails closed.
  function invocationValue(ctx, call, env, mode) {
    if (call.questionDotToken) return fail(ctx, 'optional-call');
    const fn = evaluate(ctx, call.expression, env, 'fn');
    const bindings = fn && bindArguments(ctx, fn.node, call);
    const result = bindings && factoryReturn(ctx, fn.node);
    if (!result) return undefined;
    if (ctx.running.get(fn.node)?.has(fn.env)) return fail(ctx, 'recursive-invocation');
    const callerRunning = ctx.running;
    const { frame, descriptor } = registerInvocation(fn, call, env, bindings, callerRunning);
    ctx.invocations.push(descriptor);
    ctx.running = new Map(ctx.running);
    ctx.running.set(fn.node, new Set(ctx.running.get(fn.node)).add(fn.env));
    try {
      return evaluate(ctx, result, frame, mode);
    } finally {
      ctx.running = callerRunning;
    }
  }
  return { context, fail, evaluate, bindArguments };
}
