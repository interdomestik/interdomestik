// Tenant guard stage: function targets, kernel callbacks and transaction hand-off.

import ts from 'typescript';
import { createFunctionTargets } from './rules-targets-functions.mjs';
import { referenceForm } from './syntax.mjs';

/** Installs function-target resolution and the hand-off analysis on `ctx`. */
export function installTargets(ctx) {
  const { TRANSACTION_ENTRIES, allIn, identifierOrigins, outermost, propertyNameOf, unwrap } = ctx;

  const functionTargets = createFunctionTargets(ctx, callersOf);

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
    if (ts.isCallExpression(parent) && parent.expression === value)
      return invokedProblem(fact, parent, param, path);
    // Truthiness tests of the function do not invoke it.
    if (isTruthinessTest(parent, value)) return null;
    const { member, carried } = carriedValue(value, parent);
    if (member === null && carried !== value) return 'a computed callback property';
    const call = carried.parent;
    if (!call || !ts.isCallExpression(call) || !call.arguments.includes(carried))
      return `a callback handed on (${parent.getText(fact.sourceFile).slice(0, 40)})`;
    const position = call.arguments.indexOf(carried);
    if (member === null && param === 0 && path.length === 0) {
      const opened = transactionOpener(fact, unwrap(call.expression));
      if (opened) return opened.problem;
    }
    const targets = functionTargets(fact, call.expression);
    if (!targets) return 'a callback handed to an unresolved function';
    for (const target of targets) {
      if (!kernelEntry(target)) {
        receiverSink({
          kind: 'callback',
          fact: target.fact,
          fn: target.fn,
          index: position,
          member,
          param,
          path,
        });
      } else if (
        member !== null ||
        param !== 0 ||
        path.length > 0 ||
        !kernelCallback(target, position)
      ) {
        return 'a callback handed to a kernel entry in an unsupported position';
      }
    }
    return null;
  }

  /** The value invoked directly: its receiver argument is the hand-off. */
  function invokedProblem(fact, call, param, path) {
    const spread = call.arguments.findIndex(argument => ts.isSpreadElement(argument));
    if (spread !== -1 && spread <= param) return 'a spread receiver argument';
    const argument = call.arguments[param];
    return argument ? ctx.receiverProblem(fact, argument, path) : null;
  }

  /** The member a callback is carried under (null when none or computed) and what carries it. */
  function carriedValue(value, parent) {
    if (ts.isMethodDeclaration(value) || ts.isShorthandPropertyAssignment(value))
      return { member: propertyNameOf(value.name), carried: outermost(value.parent) };
    if (
      (ts.isPropertyAssignment(parent) && parent.initializer === value) ||
      ts.isShorthandPropertyAssignment(parent)
    ) {
      return { member: propertyNameOf(parent.name), carried: outermost(parent.parent) };
    }
    return { member: null, carried: value };
  }

  /** `{ problem }` when the call opening a callback is a transaction entry, else null. */
  function transactionOpener(fact, opener) {
    if (ts.isIdentifier(opener) && allIn(identifierOrigins(fact, opener), TRANSACTION_ENTRIES))
      return { problem: null };
    if (ts.isPropertyAccessExpression(opener) && opener.name.text === 'transaction')
      return { problem: ctx.receiverProblem(fact, opener.expression) };
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

function isTruthinessTest(parent, value) {
  return (
    (ts.isConditionalExpression(parent) && parent.condition === value) ||
    (ts.isIfStatement(parent) && parent.expression === value) ||
    (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) ||
    ts.isTypeOfExpression(parent)
  );
}
