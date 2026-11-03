// Tenant guard stage helper: whether an expression is a recognized query receiver.

import ts from 'typescript';
import { hasFlag } from './rules-digest.mjs';

const FALLBACK_OPERATORS = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
]);

/**
 * Builds `receiverProblem(fact, expression, path = [], seen = new Set())`: null when `expression`
 * (read at `path`) is a recognized receiver, else why it is not.
 */
export function createReceiverProblem(ctx, declaredFunction) {
  const env = {
    declaredFunction,
    BUILDER_CLIENTS: ctx.BUILDER_CLIENTS,
    BUILDER_METHODS: ctx.BUILDER_METHODS,
    SPREAD: ctx.SPREAD,
    UNKNOWN_KEY: ctx.UNKNOWN_KEY,
    allIn: ctx.allIn,
    boundProperty: ctx.boundProperty,
    functionTargets: ctx.functionTargets,
    handOffProblem: ctx.handOffProblem,
    identifierOrigins: ctx.identifierOrigins,
    isWriteTarget: ctx.isWriteTarget,
    keyOf: ctx.keyOf,
    outermost: ctx.outermost,
    propertyNameOf: ctx.propertyNameOf,
    receiverSink: ctx.receiverSink,
    referenceAt: ctx.referenceAt,
    restCarries: ctx.restCarries,
    returnsOf: ctx.returnsOf,
    unwrap: ctx.unwrap,
    usesOf: ctx.usesOf,
  };
  env.check = (fact, expression, path = [], seen = new Set()) =>
    problemOf(env, { fact, path, seen }, expression);
  return env.check;
}

function problemOf(env, at, expression) {
  const { fact, path, seen } = at;
  const node = env.unwrap(expression);
  const site = {
    ...at,
    unknown: `an unknown receiver (${node.getText(fact.sourceFile).slice(0, 40)})`,
  };
  if (ts.isCallExpression(node)) return callProblem(env, site, node);
  if (ts.isAwaitExpression(node)) return env.check(fact, node.expression, path, seen);
  if (ts.isPropertyAccessExpression(node))
    return env.check(fact, node.expression, [node.name.text, ...path], seen);
  if (ts.isConditionalExpression(node))
    return (
      env.check(fact, node.whenTrue, path, seen) ?? env.check(fact, node.whenFalse, path, seen)
    );
  if (ts.isBinaryExpression(node) && FALLBACK_OPERATORS.has(node.operatorToken.kind)) {
    return env.check(fact, node.left, path, seen) ?? env.check(fact, node.right, path, seen);
  }
  if (ts.isObjectLiteralExpression(node))
    return path.length === 0 ? facadeProblem(env, site, node) : memberProblem(env, site, node);
  if (!ts.isIdentifier(node)) return site.unknown;
  return identifierProblem(env, site, node);
}

function callProblem(env, { fact, path, seen, unknown }, node) {
  const callee = env.unwrap(node.expression);
  if (
    path.length === 0 &&
    ts.isPropertyAccessExpression(callee) &&
    env.BUILDER_METHODS.has(callee.name.text)
  ) {
    return env.check(fact, callee.expression, [], seen);
  }
  // A function result: every value it can return.
  const targets = env.functionTargets(fact, node.expression);
  if (!targets || targets.length === 0) return unknown;
  for (const target of targets) {
    for (const returned of env.returnsOf(target.fn)) {
      const problem = env.check(target.fact, returned, path, seen);
      if (problem) return problem;
    }
  }
  return null;
}

// A facade of bound builder methods, `{ insert: tx.insert.bind(tx), … }`, on a recognized tx.
function facadeProblem(env, { fact, seen, unknown }, node) {
  if (node.properties.length === 0) return unknown;
  for (const property of node.properties) {
    const self = boundBuilderSelf(env, property);
    if (!self) return unknown;
    const problem = env.check(fact, self, [], seen);
    if (problem) return problem;
  }
  return null;
}

/** The `tx` of a `name: tx.name.bind(tx)` member naming a builder method, else null. */
function boundBuilderSelf(env, property) {
  const { unwrap } = env;
  const name = ts.isPropertyAssignment(property) ? env.propertyNameOf(property.name) : null;
  const bound = name && unwrap(property.initializer);
  const bind = bound && ts.isCallExpression(bound) && unwrap(bound.expression);
  const method =
    bind && ts.isPropertyAccessExpression(bind) && bind.name.text === 'bind'
      ? unwrap(bind.expression)
      : null;
  const self = method && ts.isPropertyAccessExpression(method) && unwrap(method.expression);
  const thisArgument = bound?.arguments?.length === 1 && unwrap(bound.arguments[0]);
  const matches =
    env.BUILDER_METHODS.has(name) &&
    self &&
    method.name.text === name &&
    ts.isIdentifier(self) &&
    thisArgument &&
    ts.isIdentifier(thisArgument) &&
    self.text === thisArgument.text;
  return matches ? self : null;
}

function memberProblem(env, site, node) {
  const { fact, path, seen, unknown } = site;
  const [name, ...rest] = path;
  // Walking back from the last member: a spread may or may not carry the property, so what it
  // carries is checked and the walk continues to the earlier members; an explicit member ends
  // it, and a computed key that is not a literal may write the property and is refused.
  for (const property of [...node.properties].reverse()) {
    const key = env.keyOf(property);
    if (key === env.UNKNOWN_KEY) return unknown;
    if (key === env.SPREAD) {
      const problem = env.check(fact, property.expression, path, seen);
      if (problem) return problem;
    } else if (key === name) {
      return memberValueProblem(env, { ...site, path: rest }, property);
    }
  }
  return null; // otherwise never set: the receiver is undefined, which no builder call accepts
}

function memberValueProblem(env, { fact, path, seen, unknown }, property) {
  if (ts.isShorthandPropertyAssignment(property)) return env.check(fact, property.name, path, seen);
  if (ts.isPropertyAssignment(property)) return env.check(fact, property.initializer, path, seen);
  return unknown;
}

function identifierProblem(env, site, node) {
  const { fact, path, seen, unknown } = site;
  const binding = env.referenceAt(fact, node)?.binding;
  if (!binding) return unknown;
  if (binding.kind === 'import')
    return path.length === 0 && env.allIn(env.identifierOrigins(fact, node), env.BUILDER_CLIENTS)
      ? null
      : unknown;
  // A cycle adds no value source of its own: the other sources decide.
  const mark = `${fact.file}:${binding.id.pos}:${path.join('.')}`;
  if (seen.has(mark)) return null;
  seen.add(mark);
  if (binding.kind === 'var') return variableProblem(env, site, binding);
  if (binding.kind !== 'param') return unknown;
  return parameterProblem(env, site, binding);
}

function variableProblem(env, site, binding) {
  const { fact, path, seen, unknown } = site;
  const declaration = binding.decl;
  const property =
    declaration.name === binding.id ? null : env.boundProperty(declaration.name, binding.id);
  if (declaration.name !== binding.id && property === null) return unknown;
  if (property === '...' && path.length > 0 && !env.restCarries(declaration.name, path[0]))
    return null; // the rest omits it: undefined
  const at = property === null || property === '...' ? path : [property, ...path];
  if (hasFlag(declaration.parent, ts.NodeFlags.Const)) {
    return declaration.initializer ? env.check(fact, declaration.initializer, at, seen) : unknown;
  }
  if (!hasFlag(declaration.parent, ts.NodeFlags.Let) || property !== null) return unknown;
  return letProblem(env, site, binding);
}

// `let`: the initializer and every plain assignment.
function letProblem(env, { fact, path, seen, unknown }, binding) {
  const declaration = binding.decl;
  if (declaration.initializer) {
    const problem = env.check(fact, declaration.initializer, path, seen);
    if (problem) return problem;
  }
  for (const use of env.usesOf(fact, binding)) {
    const target = env.outermost(use.node);
    if (!env.isWriteTarget(target)) continue;
    const assignment = target.parent;
    if (
      !ts.isBinaryExpression(assignment) ||
      assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken
    ) {
      return unknown;
    }
    const problem = env.check(fact, assignment.right, path, seen);
    if (problem) return problem;
  }
  return null;
}

function parameterProblem(env, { fact, path, unknown }, binding) {
  const fn = binding.decl;
  const index = fn.parameters.findIndex(
    parameter => parameter.name === binding.id || env.boundProperty(parameter.name, binding.id)
  );
  const parameter = fn.parameters[index];
  if (!parameter || parameter.dotDotDotToken) return unknown;
  const property =
    parameter.name === binding.id ? null : env.boundProperty(parameter.name, binding.id);
  if (property === '...' && path.length > 0 && !env.restCarries(parameter.name, path[0]))
    return null;
  const at = property === null || property === '...' ? path : [property, ...path];
  const declared = env.declaredFunction(fact, fn);
  if (declared) env.receiverSink({ kind: 'param', fact, fn, index, path: at, declared });
  // A function that is also a call argument (`const f = wrap(fn)`) is handed on as well.
  const wrapped = env.outermost(fn).parent;
  if (declared && !(ts.isCallExpression(wrapped) && wrapped.arguments.includes(env.outermost(fn))))
    return null;
  const handOff = env.handOffProblem(fact, fn, index, at);
  return handOff ? `${unknown}: ${handOff}` : null;
}
