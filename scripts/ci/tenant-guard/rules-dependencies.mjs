// Tenant guard stage: expression dependencies, transaction transfer and tenant-state collection.

import ts from 'typescript';
import { LEGACY, PRIVILEGED } from './manifest.mjs';
import { originKey } from './modules.mjs';
import { hasFlag, within } from './rules-digest.mjs';
import { isFunctionLike, unitName } from './syntax.mjs';

/** Installs the dependency, transfer and tenant-state analyses on `ctx`. */
export function installDependencies(ctx) {
  const { closureUnchanged, factsOf, originsOf } = ctx;

  // ---- intra-unit def-use closure of an expression -----------------------------------------
  function expressionDependencies(fact, unit, roots) {
    const unitReferences = fact.references.filter(reference => within(reference.node, unit));
    const params = new Set();
    const external = [];
    const seenBindings = new Set();
    const queue = unitReferences.filter(reference =>
      roots.some(root => within(reference.node, root))
    );
    while (queue.length > 0) {
      const reference = queue.shift();
      const { binding } = reference;
      if (!binding || seenBindings.has(binding)) continue;
      seenBindings.add(binding);
      if (binding.kind === 'param') {
        if (binding.decl === unit) params.add(binding.name);
        continue; // parameters of nested callbacks receive values produced inside the unit
      }
      if (binding.kind === 'import' || binding.scope === fact.sourceFile) {
        external.push(reference);
        continue;
      }
      // A local declared inside the unit: follow its initializer and every assignment to it.
      const sources = localSources(binding, unitReferences);
      queue.push(
        ...unitReferences.filter(other => sources.some(source => within(other.node, source)))
      );
    }
    return { params, external };
  }

  function dependenciesUnchanged(fact, references) {
    for (const reference of references) {
      for (const origin of originsOf(fact, reference).origins) {
        if (!closureUnchanged(origin))
          return { ok: false, witness: reference.node.getText(fact.sourceFile) };
      }
    }
    return { ok: true };
  }

  const WRAPPERS = node =>
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node);
  const unwrap = node => {
    let current = node;
    while (current && WRAPPERS(current)) current = current.expression;
    return current;
  };
  const outermost = node => {
    let current = node;
    while (current.parent && WRAPPERS(current.parent)) current = current.parent;
    return current;
  };

  /** The call (or construction) a value is an argument of, directly or nested in object and array literals. */
  function argumentCall(value) {
    let current = value;
    for (;;) {
      const parent = current.parent;
      if (
        ts.isShorthandPropertyAssignment(parent) ||
        (ts.isPropertyAssignment(parent) && parent.initializer === current)
      ) {
        current = outermost(parent.parent);
      } else if (
        ts.isArrayLiteralExpression(parent) ||
        (ts.isSpreadElement(parent) && ts.isArrayLiteralExpression(parent.parent))
      ) {
        current = outermost(ts.isSpreadElement(parent) ? parent.parent : parent);
      } else break;
    }
    const call = current.parent;
    return call &&
      (ts.isCallExpression(call) || ts.isNewExpression(call)) &&
      call.arguments?.includes(current)
      ? call
      : null;
  }

  /** Why a callee (a function value) cannot be trusted as unchanged, or null when it can. */
  function calleeProblem(fact, unit, callee) {
    const { params, external } = expressionDependencies(fact, unit, [callee]);
    if (params.size > 0)
      return `a callee taken from the parameters of ${unitName(unit, fact.sourceFile)}`;
    const dependencies = dependenciesUnchanged(fact, external);
    return dependencies.ok ? null : `changed code (${dependencies.witness})`;
  }

  // ---- transaction transfers (A5-r2 B) -------------------------------------------------------
  // The transaction a retained legacy context hands its callback is a capability. The callback may
  // use it directly (`tx.select()…`, a nested `tx.transaction(cb)` held to the same rule) or pass
  // it as a call argument, alone or inside object and array literals, to a callee whose closure is
  // unchanged. Any other use (returned, stored, aliased, awaited), and a callback given by
  // reference whose closure changed, is refused.
  function transactionUseProblem(fact, unit, node) {
    const value = outermost(node);
    const parent = value.parent;
    if (
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === value
    ) {
      const call = outermost(parent).parent;
      const nested = ts.isPropertyAccessExpression(parent) && parent.name.text === 'transaction';
      if (nested && call && ts.isCallExpression(call) && call.expression === outermost(parent)) {
        for (const argument of call.arguments) {
          const problem = transferProblem(fact, unit, argument);
          if (problem) return problem;
        }
      }
      return null;
    }
    const call = argumentCall(value);
    if (call) return calleeProblem(fact, unit, call.expression);
    return `an unsupported transfer (${parent.getText(fact.sourceFile).slice(0, 60)})`;
  }

  function transferProblem(fact, unit, callback) {
    const target = unwrap(callback);
    if (!isFunctionLike(target)) return calleeProblem(fact, unit, target);
    const [first] = target.parameters;
    if (!first) return null;
    if (!ts.isIdentifier(first.name)) return 'a destructured transaction parameter';
    for (const reference of fact.references) {
      const { binding } = reference;
      if (binding?.kind !== 'param' || binding.decl !== target || binding.name !== first.name.text)
        continue;
      const problem = transactionUseProblem(fact, unit, reference.node);
      if (problem) return problem;
    }
    return null;
  }

  // ---- module state read by a retained tenant input (A5-r2 A) -------------------------------
  // A module binding that a retained tenant argument (or an unchanged caller's argument to a legacy
  // sink) reads directly, or through the initializers that alias it, is safe only if its value
  // cannot change: a const bound to a primitive. Any other binding (let/var, or a const object,
  // array or call result) is tenant state, accepted only in the finite forms of stateUseProblem.
  const PRIMITIVE_OPERATORS = new Set([
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
    ts.SyntaxKind.CommaToken,
  ]);
  function holdsPrimitive(statement, declaration) {
    if (!hasFlag(statement.declarationList, ts.NodeFlags.Const)) return false;
    const initializer = unwrap(declaration.initializer);
    if (!initializer) return false;
    if (ts.isBinaryExpression(initializer)) {
      const operator = initializer.operatorToken.kind;
      return (
        !PRIMITIVE_OPERATORS.has(operator) &&
        !(operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment)
      );
    }
    return (
      ts.isStringLiteral(initializer) ||
      ts.isNumericLiteral(initializer) ||
      ts.isBigIntLiteral(initializer) ||
      ts.isNoSubstitutionTemplateLiteral(initializer) ||
      ts.isTemplateExpression(initializer) ||
      ts.isPrefixUnaryExpression(initializer) ||
      ts.isTypeOfExpression(initializer) ||
      [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
        initializer.kind
      )
    );
  }

  // Discovery follows module bindings through the initializers that alias them and, for a function
  // (declared or bound to a const), through the def-use closure of its return expressions: the
  // module state a retained tenant input is computed from, however many unchanged functions sit in
  // between (A5-r2 Q1). Modules bound by a legacy pin are not entered; their exported values are
  // seeded as kernel state instead (Q2).
  const tenantState = new Map(); // origin key -> { origin, kind: 'value' | 'function' | 'kernel' }
  const stateVisited = new Set();
  function returnRoots(unit) {
    if (ts.isArrowFunction(unit) && !ts.isBlock(unit.body)) return [unit.body];
    const roots = [];
    const visit = node => {
      if (node !== unit && isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression) roots.push(node.expression);
      ts.forEachChild(node, visit);
    };
    visit(unit);
    return roots;
  }
  function collectTenantState(fact, references) {
    const queue = references.flatMap(reference => originsOf(fact, reference).origins);
    while (queue.length > 0) collectStateOrigin(queue, queue.shift());
  }
  function collectStateOrigin(queue, origin) {
    if (origin.external || origin.unresolved || origin.namespace) return;
    const key = originKey(origin);
    if (!key || LEGACY.has(key) || PRIVILEGED.has(key) || stateVisited.has(key)) return;
    stateVisited.add(key);
    if (ctx.pinnedModules.has(origin.file)) return;
    const owner = factsOf(origin.file);
    const statement = owner?.statements.get(origin.name);
    if (!statement) return;
    for (const unit of recordState(queue, { owner, statement, origin, key })) {
      const { external } = expressionDependencies(owner, unit, returnRoots(unit));
      for (const reference of external) queue.push(...originsOf(owner, reference).origins);
    }
  }
  /** Records the state a top-level statement declares; returns the functions to follow. */
  function recordState(queue, { owner, statement, origin, key }) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      tenantState.set(key, { origin, kind: 'function' });
      return ts.isFunctionDeclaration(statement) ? [statement] : [];
    }
    if (!ts.isVariableStatement(statement)) return [];
    const declaration = statement.declarationList.declarations.find(
      candidate => ts.isIdentifier(candidate.name) && candidate.name.text === origin.name
    );
    if (!declaration || holdsPrimitive(statement, declaration)) return [];
    const unit = owner.declarations.get(origin.name);
    const functionValue = unit !== statement && isFunctionLike(unit);
    tenantState.set(key, { origin, kind: functionValue ? 'function' : 'value' });
    // The whole initializer (a wrapper and its arguments included) is followed as an alias.
    for (const reference of owner.references) {
      if (
        within(reference.node, statement) &&
        reference.binding &&
        !(functionValue && within(reference.node, unit))
      ) {
        queue.push(...originsOf(owner, reference).origins);
      }
    }
    return functionValue ? [unit] : [];
  }
  Object.assign(ctx, {
    argumentCall,
    calleeProblem,
    collectTenantState,
    dependenciesUnchanged,
    expressionDependencies,
    holdsPrimitive,
    outermost,
    tenantState,
    transferProblem,
    unwrap,
  });
}

/** What a local binding declared inside a unit is computed from: initializer, body, assignments. */
function localSources(binding, unitReferences) {
  const sources = [];
  if (ts.isVariableDeclaration(binding.decl) && binding.decl.initializer)
    sources.push(binding.decl.initializer);
  if (binding.kind === 'function' && binding.decl.body) sources.push(binding.decl.body);
  const loop = binding.decl.parent?.parent;
  if (loop && (ts.isForOfStatement(loop) || ts.isForInStatement(loop)))
    sources.push(loop.expression);
  for (const other of unitReferences) {
    if (other.binding === binding && isAssigned(other.node)) sources.push(other.node.parent.right);
  }
  return sources;
}

function isAssigned(node) {
  const parent = node.parent;
  return Boolean(
    parent &&
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );
}
