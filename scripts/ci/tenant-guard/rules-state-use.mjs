// Tenant guard stage: tenant-state uses and the reference index they are resolved through.

import ts from 'typescript';
import { originKey } from './modules.mjs';
import { createStateUseProblem } from './rules-state-use-problem.mjs';
import { isFunctionLike } from './syntax.mjs';

/** Installs the tenant-state use analyses and the reference index on `ctx`. */
export function installStateUse(ctx) {
  const { DB_SRC, calleeProblem, originsOf, unwrap } = ctx;

  const stateUseProblem = createStateUseProblem(ctx, stateCalleeProblem);

  /**
   * Why tenant state may not be handed to `callee`, or null. Beyond the unchanged-closure rule,
   * changed code may hand it only to a function it does not itself build: one named by an import
   * or module binding. A method of a local container (`seen.add(state)`), a call result and any
   * global (`Object.assign`, `Array.from` with a mapping callback, `Object.values` whose result
   * aliases the elements) are refused: no global is assumed to be a read-only contract.
   */
  function stateCalleeProblem(fact, unit, callee, changed) {
    const problem = calleeProblem(fact, unit, callee);
    if (problem || !changed) return problem;
    let root = unwrap(callee);
    const path = [];
    while (ts.isPropertyAccessExpression(root)) {
      path.unshift(root.name.text);
      root = unwrap(root.expression);
    }
    if (!ts.isIdentifier(root))
      return `a callee built by changed code (${callee.getText(fact.sourceFile).slice(0, 40)})`;
    const binding = referenceAt(fact, root)?.binding;
    if (!binding)
      return `a global callee that may keep or change it (${[root.text, ...path].join('.')})`;
    if (binding.kind === 'import' || binding.scope === fact.sourceFile) return null;
    return `a callee built by changed code (${callee.getText(fact.sourceFile).slice(0, 40)})`;
  }

  // ---- query-builder receivers (Q2-r) -------------------------------------------------------
  // A schema value may be handed to a builder method only on a recognized receiver: a kernel
  // client, or the transaction a kernel entry (or a recognized receiver's `.transaction`) hands
  // the callback it runs. Receivers are followed through builder calls, const bindings, `let`
  // bindings (every assignment), `??`/`||`/`?:`, object properties (last writer, spreads
  // followed) and function results (every return). Parameters are bound to their callers:
  //   - a receiver read from a declared function's parameter makes it a receiver sink: every
  //     caller passes a recognized receiver there, and a default must be one;
  //   - a receiver read from the parameter of a function value (an inline callback, a function
  //     passed by name or in an object property) binds the function it is handed to: every
  //     invocation there passes a recognized receiver, and every further hand-off is followed.
  // Anything else is an unknown receiver and is refused.
  const BUILDER_CLIENTS = new Set([
    `${DB_SRC}/db.ts#db`,
    `${DB_SRC}/db.ts#dbAdmin`,
    `${DB_SRC}/db.ts#dbRls`,
  ]);
  const TRANSACTION_ENTRIES = new Set([
    `${DB_SRC}/tenant-authority-context.ts#withTenantAuthority`,
    `${DB_SRC}/tenant.ts#withTenantContext`,
    `${DB_SRC}/tenant.ts#withTenantDb`,
  ]);
  const referenceIndex = new WeakMap();
  function referenceAt(fact, identifier) {
    let index = referenceIndex.get(fact);
    if (!index) {
      index = new Map(fact.references.map(reference => [reference.node, reference]));
      referenceIndex.set(fact, index);
    }
    return index.get(identifier);
  }
  function identifierOrigins(fact, identifier) {
    const reference = referenceAt(fact, identifier);
    return reference?.binding ? originsOf(fact, reference).origins.map(originKey) : [];
  }
  const allIn = (keys, set) => keys.length > 0 && keys.every(key => set.has(key));
  const propertyNameOf = name =>
    name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) ? name.text : null;
  // The key an object-literal member writes: its name, SPREAD, or UNKNOWN_KEY for a computed key
  // that is not a literal (it may write any property).
  const SPREAD = Symbol('spread');
  const UNKNOWN_KEY = Symbol('unknown key');
  const keyOf = property => {
    if (ts.isSpreadAssignment(property)) return SPREAD;
    const name = property.name;
    if (name && ts.isComputedPropertyName(name)) {
      const expression = unwrap(name.expression);
      return ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)
        ? expression.text
        : UNKNOWN_KEY;
    }
    return propertyNameOf(name) ?? (ts.isNumericLiteral(name) ? name.text : UNKNOWN_KEY);
  };
  /** The property a binding element reads (its name, or UNKNOWN_KEY for a computed one). */
  const elementKey = element => {
    const name = element.propertyName ?? element.name;
    if (ts.isComputedPropertyName(name)) {
      const expression = unwrap(name.expression);
      return ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)
        ? expression.text
        : UNKNOWN_KEY;
    }
    return propertyNameOf(name) ?? UNKNOWN_KEY;
  };
  const usesOf = (fact, binding) =>
    fact.references.filter(reference => reference.binding === binding);

  /** The property an object binding pattern binds to `id` ('...' for a rest element). */
  function boundProperty(pattern, id) {
    if (!ts.isObjectBindingPattern(pattern)) return null;
    for (const element of pattern.elements) {
      if (element.name !== id) continue;
      if (element.dotDotDotToken) return '...';
      return element.propertyName ? propertyNameOf(element.propertyName) : id.text;
    }
    return null;
  }

  Object.assign(ctx, {
    BUILDER_CLIENTS,
    SPREAD,
    TRANSACTION_ENTRIES,
    UNKNOWN_KEY,
    allIn,
    boundProperty,
    elementKey,
    identifierOrigins,
    keyOf,
    propertyNameOf,
    referenceAt,
    returnsOf,
    stateCalleeProblem,
    stateUseProblem,
    usesOf,
  });
}

/** The expressions a function returns (an expression body, or its own return statements). */
function returnsOf(fn) {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const found = [];
  const visit = node => {
    if (node !== fn.body && isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) found.push(node.expression);
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return found;
}
