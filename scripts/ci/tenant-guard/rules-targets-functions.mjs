// Tenant guard stage helper: the functions an expression may evaluate to.

import ts from 'typescript';
import { hasFlag } from './rules-digest.mjs';
import { isFunctionLike } from './syntax.mjs';

const FALLBACK_OPERATORS = [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken];

/**
 * Builds `functionTargets(fact, expression, path = [], seen = new Set())`: the functions an
 * expression may evaluate to, or null when they cannot all be resolved.
 */
export function createFunctionTargets(ctx, callersOf) {
  const env = {
    ctx,
    callersOf,
    SPREAD: ctx.SPREAD,
    UNKNOWN_KEY: ctx.UNKNOWN_KEY,
    boundProperty: ctx.boundProperty,
    factsOf: ctx.factsOf,
    graph: ctx.graph,
    keyOf: ctx.keyOf,
    originsOf: ctx.originsOf,
    outermost: ctx.outermost,
    referenceAt: ctx.referenceAt,
    returnsOf: ctx.returnsOf,
    unwrap: ctx.unwrap,
  };
  env.resolve = (fact, expression, path = [], seen = new Set()) =>
    targetsOf(env, fact, expression, path, seen);
  return env.resolve;
}

function targetsOf(env, fact, expression, path, seen) {
  const node = env.unwrap(expression);
  if (isFunctionLike(node)) return path.length === 0 ? [{ fact, fn: node }] : null;
  if (ts.isConditionalExpression(node))
    return unionOf(env, fact, [node.whenTrue, node.whenFalse], path, seen);
  if (ts.isBinaryExpression(node) && FALLBACK_OPERATORS.includes(node.operatorToken.kind))
    return unionOf(env, fact, [node.left, node.right], path, seen);
  if (ts.isPropertyAccessExpression(node))
    return env.resolve(fact, node.expression, [node.name.text, ...path], seen);
  if (ts.isObjectLiteralExpression(node) && path.length > 0)
    return objectMemberTargets(env, fact, node, path, seen);
  if (ts.isCallExpression(node)) return returnedTargets(env, fact, node, path, seen);
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return [];
  if (!ts.isIdentifier(node)) return null;
  if (node.text === 'undefined') return [];
  return identifierTargets(env, fact, node, path, seen);
}

function unionOf(env, fact, parts, path, seen) {
  const results = parts.map(part => env.resolve(fact, part, path, seen));
  return results.includes(null) ? null : results.flat();
}

function objectMemberTargets(env, fact, node, path, seen) {
  const [name, ...rest] = path;
  // Walking back from the last member: a spread may or may not carry the property, so its
  // contribution is collected and the walk continues; an explicit member ends it.
  const targets = [];
  for (const property of [...node.properties].reverse()) {
    const key = env.keyOf(property);
    if (key === env.UNKNOWN_KEY) return null;
    if (key === env.SPREAD) {
      const spread = env.resolve(fact, property.expression, path, seen);
      if (!spread) return null;
      targets.push(...spread);
    } else if (key === name) {
      const own = memberTargets(env, fact, property, rest, seen);
      return own ? [...targets, ...own] : null;
    }
  }
  return targets; // otherwise never set: nothing to invoke
}

function memberTargets(env, fact, property, rest, seen) {
  if (ts.isShorthandPropertyAssignment(property))
    return env.resolve(fact, property.name, rest, seen);
  if (ts.isPropertyAssignment(property)) return env.resolve(fact, property.initializer, rest, seen);
  return rest.length === 0 && ts.isMethodDeclaration(property) ? [{ fact, fn: property }] : null;
}

function returnedTargets(env, fact, node, path, seen) {
  const callees = env.resolve(fact, node.expression, [], seen);
  if (!callees) return null;
  const targets = [];
  for (const callee of callees) {
    const returns = env.returnsOf(callee.fn);
    if (returns.length === 0) return null;
    for (const returned of returns) {
      const inner = env.resolve(callee.fact, returned, path, seen);
      if (!inner) return null;
      targets.push(...inner);
    }
  }
  return targets;
}

function identifierTargets(env, fact, node, path, seen) {
  const reference = env.referenceAt(fact, node);
  const binding = reference?.binding;
  if (!binding) return null;
  const mark = `${fact.file}:${binding.id.pos}:${path.join('.')}`;
  if (seen.has(mark)) return [];
  seen.add(mark);
  if (binding.kind === 'function') return path.length === 0 ? [{ fact, fn: binding.decl }] : null;
  if (binding.kind === 'var') return variableTargets(env, fact, binding, path, seen);
  if (binding.kind === 'param') return parameterTargets(env, fact, binding, path, seen);
  if (binding.kind !== 'import' || path.length > 0) return null;
  return exportTarget(env, env.originsOf(fact, reference).origins);
}

/** The one declared function a single resolved export names, or null. */
function exportTarget(env, origins) {
  if (origins.length !== 1 || !origins[0].file) return null;
  const owner = env.factsOf(origins[0].file);
  const fn = owner?.declarations.get(origins[0].name);
  return fn && isFunctionLike(fn) ? [{ fact: owner, fn }] : null;
}

function variableTargets(env, fact, binding, path, seen) {
  const declaration = binding.decl;
  if (!declaration.initializer || !hasFlag(declaration.parent, ts.NodeFlags.Const)) return null;
  if (declaration.name !== binding.id) {
    const property = env.boundProperty(declaration.name, binding.id);
    if (property === null) return null;
    const at = property === '...' ? path : [property, ...path];
    return env.resolve(fact, declaration.initializer, at, seen);
  }
  const top = fact.declarations.get(binding.name);
  if (
    path.length === 0 &&
    top &&
    isFunctionLike(top) &&
    declaration.parent.parent?.parent === fact.sourceFile
  ) {
    return [{ fact, fn: top }];
  }
  return env.resolve(fact, declaration.initializer, path, seen);
}

function parameterTargets(env, fact, binding, path, seen) {
  const fn = binding.decl;
  // `import('<module>').then(({ name }) => …)`: an export of that module.
  const loader = dynamicImportLoader(env, fn);
  if (loader) {
    const name = env.boundProperty(fn.parameters[0].name, binding.id);
    if (!name || name === '...' || path.length > 0) return null;
    return exportTarget(env, env.graph.resolveImport(fact.file, loader.arguments[0].text, name));
  }
  return callerArgumentTargets(env, fact, binding, path, seen);
}

/** The `import('<module>')` call whose `.then` callback is `fn`, destructuring its first parameter. */
function dynamicImportLoader(env, fn) {
  const { unwrap } = env;
  const callback = env.outermost(fn);
  const then = callback.parent;
  const loader =
    ts.isCallExpression(then) &&
    then.arguments[0] === callback &&
    ts.isPropertyAccessExpression(unwrap(then.expression)) &&
    unwrap(then.expression).name.text === 'then'
      ? unwrap(unwrap(then.expression).expression)
      : null;
  const isImport =
    loader &&
    ts.isCallExpression(loader) &&
    loader.expression.kind === ts.SyntaxKind.ImportKeyword &&
    loader.arguments.length === 1 &&
    ts.isStringLiteralLike(loader.arguments[0]) &&
    fn.parameters[0] &&
    ts.isObjectBindingPattern(fn.parameters[0].name);
  return isImport ? loader : null;
}

// A function supplied by the callers of a declared function: every value they pass.
function callerArgumentTargets(env, fact, binding, path, seen) {
  const fn = binding.decl;
  const index = fn.parameters.findIndex(
    parameter => parameter.name === binding.id || env.boundProperty(parameter.name, binding.id)
  );
  const parameter = fn.parameters[index];
  const declared = parameter && !parameter.dotDotDotToken && env.ctx.declaredFunction(fact, fn);
  if (!declared) return null;
  const property =
    parameter.name === binding.id ? null : env.boundProperty(parameter.name, binding.id);
  const at = property === null || property === '...' ? path : [property, ...path];
  const targets = parameter.initializer ? env.resolve(fact, parameter.initializer, at, seen) : [];
  if (!targets) return null;
  for (const { fact: caller, reference: use, form } of env.callersOf(fact, declared)) {
    if (form === 'export') continue;
    const passed = passedTargets(env, { caller, use, form, index, at }, seen);
    if (!passed) return null;
    targets.push(...passed);
  }
  return targets;
}

/** What one caller passes at `index`: [] when it passes nothing, null when unresolvable. */
function passedTargets(env, { caller, use, form, index, at }, seen) {
  const value = env.outermost(use.node);
  const call = value.parent;
  if (form !== 'call' || !ts.isCallExpression(call) || call.expression !== value) return null;
  const spread = call.arguments.findIndex(argument => ts.isSpreadElement(argument));
  if (spread !== -1 && spread <= index) return null;
  const argument = call.arguments[index];
  if (!argument) return [];
  return env.resolve(caller, argument, at, seen);
}
