// Internal finite M4 kernel derivation. No runtime admission authority.
import ts from 'typescript';
import { expect, failM4Source, literal, byCanonical, same } from './db-access-m4-syntax.mjs';
import {
  TABLES,
  ROW_BINDINGS,
  NANOID,
  AND,
  EQ,
  IS_NULL,
  WITH_TENANT,
  GUARD_FUNCTION,
} from './db-access-m4-spec.mjs';

export function ref(node, scope, label) {
  if (ts.isStringLiteral(node)) return literal(node.text);
  if (ts.isNumericLiteral(node)) return `literal:${Number(node.text)}`;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'literal:true';
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'literal:false';
  if (ts.isIdentifier(node)) {
    const bound = scope.locals.get(node.text) ?? scope.unit.values.get(node.text);
    expect(bound, `${label}: unresolved binding ${node.text}`);
    return bound;
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    !node.questionDotToken &&
    ts.isIdentifier(node.expression) &&
    ts.isIdentifier(node.name)
  ) {
    const base = ref(node.expression, scope, label);
    if (TABLES.has(base)) return `${TABLES.get(base)}.${node.name.text}`;
    if (ROW_BINDINGS.some(prefix => base.startsWith(prefix))) return `${base}.${node.name.text}`;
  }
  if (
    ts.isElementAccessExpression(node) &&
    !node.questionDotToken &&
    ts.isIdentifier(node.expression) &&
    ts.isNumericLiteral(node.argumentExpression)
  ) {
    const base = ref(node.expression, scope, label);
    if (base.startsWith('rows:')) return `${base}[${Number(node.argumentExpression.text)}]`;
  }
  return failM4Source(`${label}: unreviewed expression ${ts.SyntaxKind[node.kind]}`);
}

export function column(node, scope, label) {
  expect(
    ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      TABLES.has(ref(node.expression, scope, label)),
    `${label}: expected a reviewed table column`
  );
  return ref(node, scope, label);
}

export function call(node, scope, label) {
  expect(
    ts.isCallExpression(node) &&
      !node.questionDotToken &&
      !node.typeArguments &&
      ts.isIdentifier(node.expression) &&
      !node.arguments.some(argument => ts.isSpreadElement(argument)),
    `${label}: unreviewed call shape`
  );
  return { callee: ref(node.expression, scope, label), args: [...node.arguments] };
}

export function value(node, scope, label) {
  if (ts.isObjectLiteralExpression(node)) return record(node, scope, label, value);
  if (ts.isCallExpression(node)) {
    const { callee, args } = call(node, scope, label);
    expect(callee === NANOID && args.length === 0, `${label}: unreviewed call in a value position`);
    return 'generated:nanoid()';
  }
  if (ts.isNewExpression(node)) {
    expect(
      ts.isIdentifier(node.expression) &&
        node.expression.text === 'Date' &&
        !node.typeArguments &&
        node.arguments?.length === 0,
      `${label}: unreviewed construction`
    );
    return 'clock:new Date()';
  }
  return ref(node, scope, label);
}

export function record(node, scope, label, read) {
  expect(ts.isObjectLiteralExpression(node), `${label}: expected an object literal`);
  const result = {};
  for (const property of node.properties) {
    const shorthand =
      ts.isShorthandPropertyAssignment(property) && !property.objectAssignmentInitializer;
    expect(
      shorthand || (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)),
      `${label}: unreviewed object member`
    );
    const key = property.name.text;
    expect(
      key !== '__proto__' && !Object.hasOwn(result, key),
      `${label}: duplicate or reserved key ${key}`
    );
    result[key] = read(shorthand ? property.name : property.initializer, scope, label);
  }
  return result;
}

export function predicate(node, scope, label) {
  if (ts.isConditionalExpression(node)) {
    const field = ref(node.condition, scope, label);
    const matched = predicate(node.whenTrue, scope, label);
    const absent = predicate(node.whenFalse, scope, label);
    expect(
      matched.eq && absent.isNull && matched.eq[1] === field && matched.eq[0] === absent.isNull,
      `${label}: nullable compare must be field ? eq(column, field) : isNull(column)`
    );
    return { eqOrIsNull: matched.eq };
  }
  const { callee, args } = call(node, scope, label);
  const arity = count => expect(args.length === count, `${label}: wrong operator arity`);
  switch (callee) {
    case AND:
      expect(args.length > 0, `${label}: empty conjunction`);
      return { and: args.map(arg => predicate(arg, scope, label)).sort(byCanonical) };
    case EQ:
      arity(2);
      return { eq: [column(args[0], scope, label), ref(args[1], scope, label)] };
    case IS_NULL:
      arity(1);
      return { isNull: column(args[0], scope, label) };
    case WITH_TENANT:
      arity(3);
      return {
        withTenant: [
          ref(args[0], scope, label),
          column(args[1], scope, label),
          predicate(args[2], scope, label),
        ],
      };
    case GUARD_FUNCTION:
      arity(1);
      expect(scope.unit.guard, `${label}: compare-and-set guard used before it was derived`);
      return { guard: { snapshot: ref(args[0], scope, label), predicate: scope.unit.guard } };
    default:
      return failM4Source(`${label}: unreviewed predicate operator ${callee}`);
  }
}

export function projection(node, scope, label) {
  return record(node, scope, label, column);
}

export function table(node, scope, label) {
  const name = TABLES.get(ref(node, scope, label));
  expect(name, `${label}: builder target is not a reviewed table`);
  return name;
}

export function fields(node, scope, label) {
  return record(node, scope, label, value);
}

export const BUILDER = {
  select: projection,
  returning: projection,
  from: table,
  update: table,
  insert: table,
  where: predicate,
  set: fields,
  values: fields,
  for: (node, _scope, label) => {
    expect(ts.isStringLiteral(node), `${label}: lock mode is not a literal`);
    return node.text;
  },
  limit: (node, _scope, label) => {
    expect(ts.isNumericLiteral(node), `${label}: limit is not a literal`);
    return Number(node.text);
  },
};

export function transactionQuery(node, scope, label, steps) {
  expect(ts.isAwaitExpression(node), `${label}: database call is not awaited`);
  const calls = [];
  let current = node.expression;
  while (ts.isCallExpression(current)) {
    const callee = current.expression;
    expect(
      !current.questionDotToken &&
        !current.typeArguments &&
        ts.isPropertyAccessExpression(callee) &&
        !callee.questionDotToken &&
        ts.isIdentifier(callee.name),
      `${label}: builder step is not a direct method call`
    );
    calls.unshift({ method: callee.name.text, args: current.arguments });
    current = callee.expression;
  }
  expect(ts.isIdentifier(current), `${label}: builder receiver is not a binding`);
  const receiver = ref(current, scope, label);
  expect(
    receiver === 'tx',
    `${label}: not executed on the caller-owned transaction (receiver ${receiver})`
  );
  const methods = calls.map(({ method }) => method);
  expect(
    same(methods, steps),
    `${label}: builder steps ${methods.join('.')} are not ${steps.join('.')}`
  );
  const parts = {};
  for (const { method, args } of calls) {
    expect(
      args.length === 1 && !ts.isSpreadElement(args[0]),
      `${label}: ${method} takes exactly one argument`
    );
    parts[method] = BUILDER[method](args[0], scope, label);
  }
  return parts;
}
