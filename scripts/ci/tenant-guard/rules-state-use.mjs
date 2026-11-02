// Tenant guard stage: tenant-state uses and the reference index they are resolved through.

import ts from 'typescript';
import { originKey } from './modules.mjs';
import { isFunctionLike, unitOf } from './syntax.mjs';

/** Installs the tenant-state use analyses and the reference index on `ctx`. */
export function installStateUse(ctx) {
  const {
    BUILDER_METHODS,
    DB_SRC,
    MUTATORS,
    SCHEMA,
    argumentCall,
    calleeProblem,
    closureUnchanged,
    escapeContract,
    isWriteTarget,
    originsOf,
    outermost,
    readContract,
    shallowPrimitive,
    unwrap,
    yieldsOperand,
  } = ctx;

  /**
   * Why a reference to tenant state is not an accepted form, or null when it is. Refused from any
   * code: a write (assignment, update, delete, destructuring target), a call through a computed
   * member that is not a literal, a known mutating method, and an escape (stored, returned,
   * aliased, passed to a callee whose closure changed). Changed code may in addition call no method
   * on the state at all unless a source-bound read-only contract names that member path (Q3).
   * Accepted: member reads, iteration, operators and conditions, calls into unchanged closures,
   * and, for reviewed schema values only, being handed to a finite query-builder method (Q2). A
   * function binding is refused only when it is reassigned.
   */
  function stateUseProblem(fact, node, entry, note) {
    const { origin, kind } = entry;
    const unit = unitOf(node);
    const changed = !unit || !fact.unchanged(unit);
    let value = outermost(node);
    const path = [];
    let member = false;
    let computed = false;
    while (
      (ts.isPropertyAccessExpression(value.parent) || ts.isElementAccessExpression(value.parent)) &&
      value.parent.expression === value
    ) {
      const access = value.parent;
      member = true;
      if (ts.isPropertyAccessExpression(access)) path.push(access.name.text);
      else {
        const argument = unwrap(access.argumentExpression);
        if (ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument))
          path.push(argument.text);
        else computed = true;
      }
      value = outermost(access);
    }
    const parent = value.parent;
    // Unchanged code that writes or mutates state keeps doing so; when what it writes depends on
    // the unit's own parameters the unit is a writer, held to the legacy-sink caller rules.
    const writer = target => {
      if (changed) return null;
      note.writer(fact, unit, target);
      return null;
    };
    if (isWriteTarget(value)) return changed ? 'is written by changed code' : writer(value.parent);
    if (kind === 'function') return null;
    if (
      (ts.isCallExpression(parent) || ts.isTaggedTemplateExpression(parent)) &&
      (parent.expression ?? parent.tag) === value
    ) {
      if (!member) return closureUnchanged(origin) ? null : 'is called while its closure changed';
      if (computed) return changed ? 'is called through a computed member' : writer(parent);
      const method = path[path.length - 1];
      if (MUTATORS.has(method))
        return changed ? `is mutated by changed code (${method})` : writer(parent);
      if (changed && !readContract(entry.root ?? originKey(origin), path.join('.'))) {
        return `is called by changed code (${path.join('.')}) without a read-only contract`;
      }
      return null;
    }
    const schema = kind === 'kernel' && SCHEMA.test(origin.file);
    const call = argumentCall(value);
    if (call) {
      const callee = unwrap(call.expression);
      if (
        schema &&
        ts.isPropertyAccessExpression(callee) &&
        BUILDER_METHODS.has(callee.name.text)
      ) {
        const receiver = ctx.receiverProblem(fact, callee.expression);
        return receiver ? `is handed to ${receiver}` : null;
      }
      const problem = stateCalleeProblem(fact, unit, call.expression, changed);
      return problem ? `is passed to ${problem}` : null;
    }
    if (schema && member && ctx.builderProjection(fact, value)) return null;
    if (
      ts.isSpreadElement(parent) &&
      (ts.isCallExpression(parent.parent) || ts.isNewExpression(parent.parent))
    ) {
      const problem = stateCalleeProblem(fact, unit, parent.parent.expression, changed);
      return problem ? `is spread into ${problem}` : null;
    }
    // A shallow copy or an iteration hands out the members themselves: from changed code only
    // when every member of the state is a primitive (a const literal of primitives).
    if (
      (ts.isForOfStatement(parent) && parent.expression === value) ||
      (ts.isSpreadElement(parent) && ts.isArrayLiteralExpression(parent.parent)) ||
      ts.isSpreadAssignment(parent)
    ) {
      return !changed || (!member && shallowPrimitive(origin))
        ? null
        : 'is copied or iterated by changed code while its members are not primitives';
    }
    // Reads that yield a primitive: key iteration, operators whose result is not an operand,
    // conditions, template text, computed keys. (`a ?? b`, `a || b`, `a && b` and `a, b` can
    // yield the operand itself.)
    if (
      (ts.isForInStatement(parent) && parent.expression === value) ||
      (ts.isBinaryExpression(parent) &&
        !isWriteTarget(parent.left) &&
        !yieldsOperand(parent, value)) ||
      ts.isPrefixUnaryExpression(parent) ||
      ts.isTypeOfExpression(parent) ||
      ts.isTemplateSpan(parent) ||
      (ts.isElementAccessExpression(parent) && parent.argumentExpression === value) ||
      (ts.isConditionalExpression(parent) && parent.condition === value) ||
      ((ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isSwitchStatement(parent)) &&
        parent.expression === value)
    ) {
      return null;
    }
    if (member && !changed) return null; // a member read in unchanged code
    // `const ALIAS = state` at module scope: the alias is the same state, judged at its own uses.
    if (
      !member &&
      ts.isVariableDeclaration(parent) &&
      parent.initializer === value &&
      ts.isIdentifier(parent.name)
    ) {
      const statement = parent.parent?.parent;
      if (
        statement &&
        ts.isVariableStatement(statement) &&
        statement.parent === fact.sourceFile &&
        parent.parent.flags & ts.NodeFlags.Const
      ) {
        note.alias({ file: fact.file, name: parent.name.text }, entry);
        return null;
      }
    }
    if (escapeContract(entry.root ?? originKey(origin), fact, unit)) return null;
    return `escapes (${parent?.getText(fact.sourceFile).slice(0, 60)})`;
  }

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
    stateUseProblem,
    usesOf,
  });
}
