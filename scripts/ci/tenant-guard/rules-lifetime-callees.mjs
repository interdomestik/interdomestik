// Tenant guard stage helper (L): the functions a call lending a borrowed capability may invoke.
//
// Only stable declarations count: a function declaration that is never reassigned, or a const
// bound directly to a function value. A callee read from a parameter (a higher-order runner such
// as `action(tx)` or `args.persistEffects(tx)`) is bound to its callers: every direct call of the
// declared runner must pass, at that position, a function value that resolves the same way. A
// runner handed on as a value, a callback carried by a non-literal object, globals, members and
// computed callees are refused.

import ts from 'typescript';
import { hasFlag } from './rules-digest.mjs';
import { isFunctionLike } from './syntax.mjs';

/** Builds `stableTargets(fact, callee)`: [{ fact, fn }] or why the callee cannot be followed. */
export function createLifetimeCallees(ctx, { bindingOf, usesOf }) {
  const { callersOf, declaredFunction, functionTargets, isWriteTarget, keyOf, outermost } = ctx;
  const { elementKey, referenceAt, unwrap } = ctx;
  const text = (fact, node) => node.getText(fact.sourceFile).slice(0, 40);

  function stableTargets(fact, callee, seen = new Set()) {
    const node = unwrap(callee);
    if (isFunctionLike(node)) return [{ fact, fn: node }];
    let root = node;
    const path = [];
    if (ts.isPropertyAccessExpression(node)) {
      path.push(node.name.text);
      root = unwrap(node.expression);
    }
    if (!ts.isIdentifier(root)) return `a callee that is not a declared name (${text(fact, node)})`;
    const binding = referenceAt(fact, root)?.binding;
    if (!binding) return `a global callee (${text(fact, node)})`;
    if (binding.kind === 'param') return parameterTargets(fact, binding, path, seen);
    if (path.length > 0) return `a member callee (${text(fact, node)})`;
    const targets = functionTargets(fact, root);
    if (!targets || targets.length === 0) return `an unresolved callee (${root.text})`;
    if (!targets.every(declaredStably))
      return `a callee that is not a stable declaration (${root.text})`;
    return targets;
  }

  function declaredStably({ fact, fn }) {
    if (ts.isFunctionDeclaration(fn) && fn.name) {
      const binding = bindingOf(fact, fn.name);
      return !binding || !usesOf(fact, binding).some(use => isWriteTarget(outermost(use.node)));
    }
    const value = outermost(fn);
    const declaration = value.parent;
    return (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer === value &&
      ts.isIdentifier(declaration.name) &&
      hasFlag(declaration.parent, ts.NodeFlags.Const)
    );
  }

  /** Where a parameter binding sits: its function, position and the property it binds. */
  function parameterSlot(binding) {
    const fn = binding.decl;
    for (const [index, param] of fn.parameters.entries()) {
      if (param.name === binding.id) return { fn, index, path: [] };
      if (!ts.isObjectBindingPattern(param.name)) continue;
      for (const element of param.name.elements) {
        if (element.name !== binding.id) continue;
        const key = element.dotDotDotToken ? null : elementKey(element);
        return typeof key === 'string' ? { fn, index, path: [key] } : null;
      }
    }
    return null;
  }

  /** The callbacks every caller of the declared runner passes for this parameter. */
  function parameterTargets(fact, binding, memberPath, seen) {
    const slot = parameterSlot(binding);
    if (!slot) return `a callback parameter in an unsupported position (${binding.name})`;
    const path = [...slot.path, ...memberPath];
    if (path.length > 1) return `a callback nested too deeply (${binding.name})`;
    const key = `${fact.file}:${slot.fn.pos}:${slot.index}:${path.join('.')}`;
    if (seen.has(key)) return [];
    seen.add(key);
    if (usesOf(fact, binding).some(use => isWriteTarget(outermost(use.node))))
      return `a reassigned callback parameter (${binding.name})`;
    const declared = declaredFunction(fact, slot.fn);
    if (!declared) return `a callback parameter of an undeclared runner (${binding.name})`;
    const targets = [];
    const callers = callersOf(fact, declared);
    // Fail closed: a runner no reviewed source calls proves nothing about its callbacks.
    if (callers.length === 0) return `a callback runner with no reviewed callers (${binding.name})`;
    for (const caller of callers) {
      const value = outermost(caller.reference.node);
      const call = value.parent;
      if (!ts.isCallExpression(call) || call.expression !== value)
        return `a callback runner handed on as a value (${binding.name})`;
      if (call.arguments.slice(0, slot.index + 1).some(ts.isSpreadElement))
        return `a spread callback argument (${binding.name})`;
      const argument = carriedCallback(call.arguments[slot.index], path);
      if (typeof argument === 'string') return argument;
      if (!argument) continue;
      const resolved = stableTargets(caller.fact, argument, seen);
      if (typeof resolved === 'string') return resolved;
      targets.push(...resolved);
    }
    return targets;
  }

  /** The callback an argument passes at `path` (null when none), or why it cannot be read. */
  function carriedCallback(argument, path) {
    if (!argument) return null;
    const value = unwrap(argument);
    if (path.length === 0) return isUndefined(value) ? null : value;
    if (!ts.isObjectLiteralExpression(value)) return 'a callback carried by a non-literal object';
    let found = null;
    for (const property of value.properties) {
      const key = keyOf(property);
      if (typeof key !== 'string') return 'a callback carried with spreads or computed keys';
      if (key !== path[0]) continue;
      if (ts.isShorthandPropertyAssignment(property)) found = property.name;
      else if (ts.isPropertyAssignment(property)) found = property.initializer;
      else return 'a callback carried as a method or accessor';
    }
    return found && !isUndefined(unwrap(found)) ? found : null;
  }
  const isUndefined = node =>
    node.kind === ts.SyntaxKind.UndefinedKeyword ||
    (ts.isIdentifier(node) && node.text === 'undefined');

  return { stableTargets };
}
