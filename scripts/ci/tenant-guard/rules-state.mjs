// Tenant guard stage: pinned tenant state, write targets and state contracts.

import ts from 'typescript';
import { LEGACY, PRIVILEGED } from './manifest.mjs';
import { originKey } from './modules.mjs';
import { byCodeUnit, hasFlag, sha256 } from './rules-digest.mjs';
import { fingerprint, isFunctionLike, unitName, unitOf } from './syntax.mjs';

/** Installs the pinned-state, write-target and state-contract analyses on `ctx`. */
export function installState(ctx) {
  const { factsOf, graph, holdsPrimitive, outermost, stateContracts, tenantState, unwrap } = ctx;

  const pinnedModules = new Set();
  function seedPinnedState() {
    for (const file of [...pinnedModules].sort(byCodeUnit)) {
      const fact = factsOf(file);
      if (!fact) continue;
      for (const name of graph.exportNames(file)) {
        for (const origin of graph.resolveExport(file, name)) {
          if (origin.file !== file) continue;
          const key = originKey(origin);
          if (!key || LEGACY.has(key) || PRIVILEGED.has(key) || tenantState.has(key)) continue;
          const statement = fact.statements.get(origin.name);
          if (!statement || !ts.isVariableStatement(statement)) continue;
          const declaration = statement.declarationList.declarations.find(
            candidate => ts.isIdentifier(candidate.name) && candidate.name.text === origin.name
          );
          if (!declaration || holdsPrimitive(statement, declaration)) continue;
          if (isFunctionLike(fact.declarations.get(origin.name))) continue;
          tenantState.set(key, { origin, kind: 'kernel' });
        }
      }
    }
  }

  // Methods that mutate their receiver in place (Array, Map, Set, Object, Reflect).
  const MUTATORS = new Set([
    'push',
    'pop',
    'shift',
    'unshift',
    'splice',
    'sort',
    'reverse',
    'fill',
    'copyWithin',
    'set',
    'delete',
    'clear',
    'add',
    'assign',
    'defineProperty',
    'defineProperties',
    'setPrototypeOf',
    'deleteProperty',
  ]);
  // Query-builder methods a reviewed schema value may be handed to (Q2). The schema value is the
  // argument, never the receiver.
  const BUILDER_METHODS = new Set([
    'select',
    'selectDistinct',
    'selectDistinctOn',
    'from',
    'insert',
    'update',
    'delete',
    'values',
    'set',
    'where',
    'having',
    'orderBy',
    'groupBy',
    'returning',
    'onConflictDoUpdate',
    'onConflictDoNothing',
    'innerJoin',
    'leftJoin',
    'rightJoin',
    'fullJoin',
    'crossJoin',
    'with',
    'as',
  ]);
  const DB_SRC = 'packages/database/src';
  const SCHEMA = /^packages\/database\/src\/schema(?:\.ts$|\/)/u;
  const isWriteTarget = node => {
    const parent = node.parent;
    if (ts.isBinaryExpression(parent) && parent.left === node) {
      const operator = parent.operatorToken.kind;
      return operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
    }
    if (
      (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)
    )
      return true;
    if (ts.isDeleteExpression(parent)) return true;
    // Destructuring assignment targets: `[state.x] = …`, `({ a: state.x } = …)`.
    let current = node;
    while (
      current.parent &&
      (ts.isArrayLiteralExpression(current.parent) ||
        ts.isSpreadElement(current.parent) ||
        ts.isShorthandPropertyAssignment(current.parent) ||
        (ts.isPropertyAssignment(current.parent) && current.parent.initializer === current) ||
        ts.isObjectLiteralExpression(current.parent))
    ) {
      current = current.parent;
    }
    return (
      current !== node &&
      ts.isBinaryExpression(current.parent) &&
      current.parent.left === current &&
      current.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    );
  };

  /** Whether a binary expression can evaluate to `operand` itself. */
  function yieldsOperand(binary, operand) {
    const operator = binary.operatorToken.kind;
    if (operator === ts.SyntaxKind.CommaToken) return binary.right === operand;
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return true;
    }
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return binary.right === operand;
    return false;
  }

  /** Whether a state binding is a const literal whose every member is a primitive literal. */
  function shallowPrimitive(origin) {
    const fact = factsOf(origin.file);
    const statement = fact?.statements.get(origin.name);
    if (!statement || !ts.isVariableStatement(statement)) return false;
    if (!hasFlag(statement.declarationList, ts.NodeFlags.Const)) return false;
    const declaration = statement.declarationList.declarations.find(
      each => ts.isIdentifier(each.name) && each.name.text === origin.name
    );
    const literal = declaration?.initializer && unwrap(declaration.initializer);
    const primitive = node => {
      const inner = unwrap(node);
      return (
        ts.isStringLiteralLike(inner) ||
        ts.isNumericLiteral(inner) ||
        inner.kind === ts.SyntaxKind.TrueKeyword ||
        inner.kind === ts.SyntaxKind.FalseKeyword ||
        inner.kind === ts.SyntaxKind.NullKeyword
      );
    };
    if (literal && ts.isArrayLiteralExpression(literal)) return literal.elements.every(primitive);
    if (literal && ts.isObjectLiteralExpression(literal))
      return literal.properties.every(
        property => ts.isPropertyAssignment(property) && primitive(property.initializer)
      );
    return false;
  }

  /** The read-only state contract that admits a changed-code call of `path` on `key`, if any. */
  function readContract(key, path) {
    const contract = stateContracts.find(entry => entry.key === key && entry.paths?.includes(path));
    if (!contract) return false;
    const separator = key.lastIndexOf('#');
    const fact = factsOf(key.slice(0, separator));
    const statement = fact?.statements.get(key.slice(separator + 1));
    return (
      Boolean(statement) && contract.sha256 === sha256(fingerprint(statement, fact.sourceFile))
    );
  }

  /** Whether a reviewed state contract admits an escape of `key` from this exact unit. */
  function escapeContract(key, fact, unit) {
    if (!unit) return false;
    const name = unitName(unit, fact.sourceFile);
    const print = sha256(fingerprint(unit, fact.sourceFile));
    return stateContracts.some(
      entry =>
        entry.key === key &&
        entry.escapes?.some(
          escape =>
            escape.file === fact.file &&
            escape.unit === name &&
            escape.sha256 === print &&
            escapeConsumed(escape)
        )
    );
  }

  /**
   * Whether the escaping unit's output reaches only its reviewed consumers: every reference to it
   * is a direct call inside a listed consumer unit whose text matches its reviewed digest. An
   * escape that names no consumer is never admitted.
   */
  function escapeConsumed(escape) {
    if (!Array.isArray(escape.consumers) || escape.consumers.length === 0) return false;
    for (const { fact, reference, form } of ctx.referencesTo(`${escape.file}#${escape.unit}`)) {
      if (form === 'export') continue;
      const use = outermost(reference.node);
      if (form !== 'call' || !ts.isCallExpression(use.parent) || use.parent.expression !== use)
        return false;
      const consumer = unitOf(reference.node);
      if (!consumer) return false;
      const consumerName = unitName(consumer, fact.sourceFile);
      const consumerPrint = sha256(fingerprint(consumer, fact.sourceFile));
      if (
        !escape.consumers.some(
          entry =>
            entry.file === fact.file &&
            entry.unit === consumerName &&
            entry.sha256 === consumerPrint
        )
      ) {
        return false;
      }
    }
    return true;
  }
  Object.assign(ctx, {
    BUILDER_METHODS,
    DB_SRC,
    MUTATORS,
    SCHEMA,
    escapeContract,
    isWriteTarget,
    pinnedModules,
    readContract,
    seedPinnedState,
    shallowPrimitive,
    yieldsOperand,
  });
}
