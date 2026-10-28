// Internal finite M4 kernel derivation. No runtime admission authority.
import ts from 'typescript';
import { expect } from './db-access-m4-syntax.mjs';
import { ref, value } from './db-access-m4-expression.mjs';
import { DENIAL } from './db-access-m4-spec.mjs';

export function constBinding(statement, label) {
  expect(
    statement &&
      ts.isVariableStatement(statement) &&
      !statement.modifiers?.length &&
      (statement.declarationList.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const &&
      statement.declarationList.declarations.length === 1,
    `${label}: expected one const declaration`
  );
  const [declaration] = statement.declarationList.declarations;
  expect(
    !declaration.type && !declaration.exclamationToken && declaration.initializer,
    `${label}: const declaration must be an untyped initialized binding`
  );
  return declaration;
}

export function bindingName(name, label, firstRow) {
  if (!firstRow) {
    expect(ts.isIdentifier(name), `${label}: expected a plain binding`);
    return name.text;
  }
  expect(
    ts.isArrayBindingPattern(name) && name.elements.length === 1,
    `${label}: expected const [row] = ...`
  );
  const [element] = name.elements;
  expect(
    ts.isBindingElement(element) &&
      !element.dotDotDotToken &&
      !element.propertyName &&
      !element.initializer &&
      ts.isIdentifier(element.name),
    `${label}: expected const [row] = ...`
  );
  return element.name.text;
}

export function guardedExit(statement, label) {
  expect(
    ts.isIfStatement(statement) && !statement.elseStatement,
    `${label}: expected a single-branch guard`
  );
  const exit = statement.thenStatement;
  if (!ts.isBlock(exit)) return { condition: statement.expression, exit };
  expect(exit.statements.length === 1, `${label}: guard branch must hold exactly its exit`);
  return { condition: statement.expression, exit: exit.statements[0] };
}

export function negates(condition, scope, descriptor, label) {
  return (
    ts.isPrefixUnaryExpression(condition) &&
    condition.operator === ts.SyntaxKind.ExclamationToken &&
    ref(condition.operand, scope, label) === descriptor
  );
}

export function thrownDenial(exit, scope, label) {
  const created = ts.isThrowStatement(exit) ? exit.expression : undefined;
  expect(
    created &&
      ts.isNewExpression(created) &&
      ts.isIdentifier(created.expression) &&
      !created.typeArguments &&
      created.arguments?.length === 1 &&
      ref(created.expression, scope, label) === DENIAL,
    `${label}: expected throw new OpsDomainDenialError(message)`
  );
  return ref(created.arguments[0], scope, label);
}

export function returned(exit, scope, label) {
  expect(ts.isReturnStatement(exit) && exit.expression, `${label}: expected a returned result`);
  return value(exit.expression, scope, label);
}
