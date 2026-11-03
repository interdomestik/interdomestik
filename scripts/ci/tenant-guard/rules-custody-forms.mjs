// Tenant guard helper: the syntactic forms the custody analysis (rules-custody.mjs) recognizes.

import ts from 'typescript';

// Members of a held value that return the same SQL (or an alias wrapper of it): still held.
export const SQL_METHODS = new Set(['as', 'mapWith']);
// Relational query methods that take their conditions in an options object.
export const RELATIONAL_METHODS = new Set(['findFirst', 'findMany']);
// Methods of a local collecting array that only add to it (their results carry no element).
export const COLLECTORS = new Set(['push', 'unshift']);
// Drizzle operators whose result is a table alias: every member is a column of the table.
export const TABLE_ALIASES = new Set(['alias', 'aliasedTable']);
export const TABLE = Symbol('table');
export const UNKNOWN = Symbol('unknown key'); // a computed key that is not a literal: it may be any key
// A stage that does not apply to a use leaves it to the next stage.
export const UNDECIDED = Symbol('undecided');

/** Whether `parent` evaluates to the held `value` itself (a branch, an operand, an await). */
export function passesThrough(parent, value, yieldsOperand) {
  return (
    (ts.isConditionalExpression(parent) && parent.condition !== value) ||
    (ts.isBinaryExpression(parent) && yieldsOperand(parent, value)) ||
    ts.isAwaitExpression(parent)
  );
}

/** Whether `parent` discards the held `value` or only tests it. */
export function isDiscarded(parent, value) {
  return (
    ts.isExpressionStatement(parent) || // discarded
    ts.isPrefixUnaryExpression(parent) ||
    (ts.isConditionalExpression(parent) && parent.condition === value) ||
    ((ts.isIfStatement(parent) || ts.isWhileStatement(parent)) && parent.expression === value)
  );
}

export function isReturnedValue(parent, value) {
  return ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === value);
}

/** `receiver.query.<table>.<method>`: the receiver (the client or transaction itself), or null. */
export function relationalReceiver(callee, unwrap) {
  const tables = unwrap(callee.expression);
  const query = ts.isPropertyAccessExpression(tables) ? unwrap(tables.expression) : null;
  return query && ts.isPropertyAccessExpression(query) && query.name.text === 'query'
    ? query.expression
    : null;
}

// The one property-key policy, for every carrier: a name or a literal computed key.
export function propertyKey(name, unwrap) {
  const literal = ts.isComputedPropertyName(name) ? unwrap(name.expression) : name;
  if (ts.isStringLiteralLike(literal) || ts.isNumericLiteral(literal)) return literal.text;
  return ts.isIdentifier(literal) && literal === name ? name.text : UNKNOWN;
}

/** Whether `callee` names a Drizzle table-alias operator imported from drizzle-orm. */
export function tableAliasCallee(fact, callee, unwrap, referenceAt) {
  const name = unwrap(callee);
  const binding = ts.isIdentifier(name) ? referenceAt(fact, name)?.binding : null;
  return (
    binding?.kind === 'import' &&
    /^drizzle-orm(?:\/|$)/u.test(binding.specifier ?? '') &&
    TABLE_ALIASES.has(binding.imported)
  );
}
