// Tenant guard stage: function targets, kernel callbacks and transaction hand-off.

import ts from 'typescript';
import { isFunctionLike, referenceForm } from './syntax.mjs';

/** Installs function-target resolution and the hand-off analysis on `ctx`. */
export function installTargets(ctx) {
  const {
    SPREAD,
    TRANSACTION_ENTRIES,
    UNKNOWN_KEY,
    allIn,
    boundProperty,
    factsOf,
    graph,
    identifierOrigins,
    keyOf,
    originsOf,
    outermost,
    propertyNameOf,
    referenceAt,
    returnsOf,
    unwrap,
  } = ctx;

  /** The functions an expression may evaluate to, or null when they cannot all be resolved. */
  function functionTargets(fact, expression, path = [], seen = new Set()) {
    const node = unwrap(expression);
    const union = (...parts) => {
      const results = parts.map(part => functionTargets(fact, part, path, seen));
      return results.includes(null) ? null : results.flat();
    };
    if (isFunctionLike(node)) return path.length === 0 ? [{ fact, fn: node }] : null;
    if (ts.isConditionalExpression(node)) return union(node.whenTrue, node.whenFalse);
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind
      )
    ) {
      return union(node.left, node.right);
    }
    if (ts.isPropertyAccessExpression(node))
      return functionTargets(fact, node.expression, [node.name.text, ...path], seen);
    if (ts.isObjectLiteralExpression(node) && path.length > 0) {
      const [name, ...rest] = path;
      // Walking back from the last member: a spread may or may not carry the property, so its
      // contribution is collected and the walk continues; an explicit member ends it.
      const targets = [];
      for (const property of [...node.properties].reverse()) {
        const key = keyOf(property);
        if (key === UNKNOWN_KEY) return null;
        if (key === SPREAD) {
          const spread = functionTargets(fact, property.expression, path, seen);
          if (!spread) return null;
          targets.push(...spread);
          continue;
        }
        if (key !== name) continue;
        const own = ts.isShorthandPropertyAssignment(property)
          ? functionTargets(fact, property.name, rest, seen)
          : ts.isPropertyAssignment(property)
            ? functionTargets(fact, property.initializer, rest, seen)
            : rest.length === 0 && ts.isMethodDeclaration(property)
              ? [{ fact, fn: property }]
              : null;
        return own ? [...targets, ...own] : null;
      }
      return targets; // otherwise never set: nothing to invoke
    }
    if (ts.isCallExpression(node)) {
      const callees = functionTargets(fact, node.expression, [], seen);
      if (!callees) return null;
      const targets = [];
      for (const callee of callees) {
        const returns = returnsOf(callee.fn);
        if (returns.length === 0) return null;
        for (const returned of returns) {
          const inner = functionTargets(callee.fact, returned, path, seen);
          if (!inner) return null;
          targets.push(...inner);
        }
      }
      return targets;
    }
    if (node.kind === ts.SyntaxKind.UndefinedKeyword) return [];
    if (!ts.isIdentifier(node)) return null;
    if (node.text === 'undefined') return [];
    const reference = referenceAt(fact, node);
    const binding = reference?.binding;
    if (!binding) return null;
    const mark = `${fact.file}:${binding.id.pos}:${path.join('.')}`;
    if (seen.has(mark)) return [];
    seen.add(mark);
    if (binding.kind === 'function') return path.length === 0 ? [{ fact, fn: binding.decl }] : null;
    if (binding.kind === 'var') {
      const declaration = binding.decl;
      if (!declaration.initializer || !(declaration.parent.flags & ts.NodeFlags.Const)) return null;
      if (declaration.name !== binding.id) {
        const property = boundProperty(declaration.name, binding.id);
        if (property === null) return null;
        const at = property === '...' ? path : [property, ...path];
        return functionTargets(fact, declaration.initializer, at, seen);
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
      return functionTargets(fact, declaration.initializer, path, seen);
    }
    if (binding.kind === 'param') {
      const fn = binding.decl;
      // `import('<module>').then(({ name }) => …)`: an export of that module.
      const callback = outermost(fn);
      const then = callback.parent;
      const loader =
        ts.isCallExpression(then) &&
        then.arguments[0] === callback &&
        ts.isPropertyAccessExpression(unwrap(then.expression)) &&
        unwrap(then.expression).name.text === 'then'
          ? unwrap(unwrap(then.expression).expression)
          : null;
      if (
        loader &&
        ts.isCallExpression(loader) &&
        loader.expression.kind === ts.SyntaxKind.ImportKeyword &&
        loader.arguments.length === 1 &&
        ts.isStringLiteralLike(loader.arguments[0]) &&
        fn.parameters[0] &&
        ts.isObjectBindingPattern(fn.parameters[0].name)
      ) {
        const name = boundProperty(fn.parameters[0].name, binding.id);
        if (!name || name === '...' || path.length > 0) return null;
        const origins = graph.resolveImport(fact.file, loader.arguments[0].text, name);
        if (origins.length !== 1 || !origins[0].file) return null;
        const owner = factsOf(origins[0].file);
        const target = owner?.declarations.get(origins[0].name);
        return target && isFunctionLike(target) ? [{ fact: owner, fn: target }] : null;
      }
      // A function supplied by the callers of a declared function: every value they pass.
      const index = fn.parameters.findIndex(
        parameter => parameter.name === binding.id || boundProperty(parameter.name, binding.id)
      );
      const parameter = fn.parameters[index];
      const declared = parameter && !parameter.dotDotDotToken && ctx.declaredFunction(fact, fn);
      if (!declared) return null;
      const property =
        parameter.name === binding.id ? null : boundProperty(parameter.name, binding.id);
      const at = property === null || property === '...' ? path : [property, ...path];
      const targets = parameter.initializer
        ? functionTargets(fact, parameter.initializer, at, seen)
        : [];
      if (!targets) return null;
      for (const { fact: caller, reference: use, form } of callersOf(fact, declared)) {
        if (form === 'export') continue;
        const value = outermost(use.node);
        const call = value.parent;
        if (form !== 'call' || !ts.isCallExpression(call) || call.expression !== value) return null;
        const spread = call.arguments.findIndex(argument => ts.isSpreadElement(argument));
        if (spread !== -1 && spread <= index) return null;
        const argument = call.arguments[index];
        if (!argument) continue;
        const passed = functionTargets(caller, argument, at, seen);
        if (!passed) return null;
        targets.push(...passed);
      }
      return targets;
    }
    if (binding.kind !== 'import' || path.length > 0) return null;
    const { origins } = originsOf(fact, reference);
    if (origins.length !== 1 || !origins[0].file) return null;
    const owner = factsOf(origins[0].file);
    const fn = owner?.declarations.get(origins[0].name);
    return fn && isFunctionLike(fn) ? [{ fact: owner, fn }] : null;
  }

  /** Whether a resolved function is a kernel transaction entry (its body is pinned, not walked). */
  const kernelEntry = target =>
    TRANSACTION_ENTRIES.has(ctx.declaredFunction(target.fact, target.fn)?.key ?? '');
  // Kernel entries take their callback as the last parameter.
  const kernelCallback = (target, position) => position === target.fn.parameters.length - 1;

  /** Whether a rest element of `pattern` still carries property `name`. */
  const restCarries = (pattern, name) =>
    !pattern.elements.some(
      element =>
        !element.dotDotDotToken && propertyNameOf(element.propertyName ?? element.name) === name
    );

  /** Every reference to a declared function, with the fact it is in and its form. */
  function callersOf(fact, declared) {
    return declared.key
      ? ctx.referencesTo(declared.key)
      : fact.references
          .filter(reference => reference.binding?.decl === declared.local)
          .map(reference => ({ fact, reference, form: referenceForm(reference.node) }));
  }

  const receiverSinks = new Map();
  const receiverQueue = [];
  function receiverSink(sink) {
    const key = [
      sink.kind,
      sink.fact.file,
      sink.fn.pos,
      sink.index,
      sink.member ?? '',
      sink.param ?? '',
      sink.path.join('.'),
    ].join(':');
    if (!receiverSinks.has(key)) {
      receiverSinks.set(key, sink);
      receiverQueue.push(sink);
    }
    return null;
  }

  /**
   * A function value at `node` is handed on; when invoked, its parameter `param` (at `path`) is a
   * receiver. Null when every way it can be invoked passes a recognized receiver (or is queued as a
   * sink to be checked), else why not.
   */
  function handOffProblem(fact, node, param, path) {
    const value = outermost(node);
    const parent = value.parent;
    if (ts.isCallExpression(parent) && parent.expression === value) {
      const spread = parent.arguments.findIndex(argument => ts.isSpreadElement(argument));
      if (spread !== -1 && spread <= param) return 'a spread receiver argument';
      const argument = parent.arguments[param];
      return argument ? ctx.receiverProblem(fact, argument, path) : null;
    }
    // Truthiness tests of the function do not invoke it.
    if (
      (ts.isConditionalExpression(parent) && parent.condition === value) ||
      (ts.isIfStatement(parent) && parent.expression === value) ||
      (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) ||
      ts.isTypeOfExpression(parent)
    ) {
      return null;
    }
    let member = null;
    let carried = value;
    if (ts.isMethodDeclaration(value) || ts.isShorthandPropertyAssignment(value)) {
      member = propertyNameOf(value.name);
      carried = outermost(value.parent);
    } else if (ts.isPropertyAssignment(parent) && parent.initializer === value) {
      member = propertyNameOf(parent.name);
      carried = outermost(parent.parent);
    } else if (ts.isShorthandPropertyAssignment(parent)) {
      member = propertyNameOf(parent.name);
      carried = outermost(parent.parent);
    }
    if (member === null && carried !== value) return 'a computed callback property';
    const call = carried.parent;
    if (!call || !ts.isCallExpression(call) || !call.arguments.includes(carried))
      return `a callback handed on (${parent.getText(fact.sourceFile).slice(0, 40)})`;
    const position = call.arguments.indexOf(carried);
    const opener = unwrap(call.expression);
    if (member === null && param === 0 && path.length === 0) {
      if (ts.isIdentifier(opener) && allIn(identifierOrigins(fact, opener), TRANSACTION_ENTRIES))
        return null;
      if (ts.isPropertyAccessExpression(opener) && opener.name.text === 'transaction')
        return ctx.receiverProblem(fact, opener.expression);
    }
    const targets = functionTargets(fact, call.expression);
    if (!targets) return 'a callback handed to an unresolved function';
    for (const target of targets) {
      if (kernelEntry(target)) {
        if (member !== null || param !== 0 || path.length > 0 || !kernelCallback(target, position))
          return 'a callback handed to a kernel entry in an unsupported position';
        continue;
      }
      receiverSink({
        kind: 'callback',
        fact: target.fact,
        fn: target.fn,
        index: position,
        member,
        param,
        path,
      });
    }
    return null;
  }
  Object.assign(ctx, {
    callersOf,
    functionTargets,
    handOffProblem,
    receiverQueue,
    receiverSink,
    receiverSinks,
    restCarries,
  });
}
