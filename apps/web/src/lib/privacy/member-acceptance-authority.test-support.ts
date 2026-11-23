import ts from 'typescript';
import {
  descendants,
  hasName,
  localBinding,
  previousStatements,
} from './member-acceptance-ast.test-support';
import { guardModule, type loadInventory } from './member-acceptance-inventory.test-support';

type Inventory = ReturnType<typeof loadInventory>;

function property(node: ts.Node, name: string): node is ts.PropertyAccessExpression {
  return ts.isPropertyAccessExpression(node) && node.name.text === name;
}

export function refusesBranch(statement: ts.Statement): boolean {
  if (ts.isBlock(statement)) {
    const last = statement.statements.at(-1);
    return last !== undefined && refusesBranch(last);
  }
  return ts.isReturnStatement(statement) || ts.isThrowStatement(statement);
}

function admissionWasChecked(inventory: Inventory, admission: ts.Expression, at: ts.Node) {
  if (!ts.isIdentifier(admission)) return false;
  const decl = localBinding(inventory.symbolAt(admission), admission)?.decl;
  const result = decl?.initializer;
  if (
    !decl ||
    !result ||
    !ts.isAwaitExpression(result) ||
    !ts.isCallExpression(result.expression)
  ) {
    return false;
  }
  if (
    !['requireAdmittedMember', 'requireMemberAcceptancePage'].some(name =>
      inventory.callsExport(result.expression as ts.CallExpression, guardModule, name)
    )
  )
    return false;

  const checks = previousStatements(at);
  const binding = checks.indexOf(decl.parent.parent as ts.Statement);
  return (
    binding >= 0 &&
    checks.slice(0, binding).some(statement => {
      if (!ts.isIfStatement(statement) || !refusesBranch(statement.thenStatement)) return false;
      return includesRefusal(inventory, statement.expression, inventory.symbolAt(admission));
    })
  );
}

function includesRefusal(
  inventory: Inventory,
  expression: ts.Expression,
  admission: ts.Symbol | undefined
): boolean {
  if (!admission) return false;
  if (ts.isParenthesizedExpression(expression))
    return includesRefusal(inventory, expression.expression, admission);
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
  ) {
    return (
      includesRefusal(inventory, expression.left, admission) ||
      includesRefusal(inventory, expression.right, admission)
    );
  }
  return (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.ExclamationToken &&
    property(expression.operand, 'ok') &&
    inventory.symbolAt(expression.operand.expression) === admission
  );
}

export function isAdmittedAuthority(
  inventory: Inventory,
  value: ts.Expression | undefined,
  at: ts.Node
): boolean {
  if (!value) return false;
  if (property(value, 'authority') && property(value.expression, 'authorized')) {
    return admissionWasChecked(inventory, value.expression.expression, at);
  }
  if (ts.isConditionalExpression(value)) {
    return (
      value.whenFalse.kind === ts.SyntaxKind.NullKeyword &&
      isAdmittedAuthority(inventory, value.whenTrue, value.whenTrue)
    );
  }
  if (!ts.isIdentifier(value)) return false;
  const found = localBinding(inventory.symbolAt(value), value);
  const init = found?.decl.initializer;
  if (!found || !init) return false;
  if (!found.binding) return isAdmittedAuthority(inventory, init, init);
  return (
    !found.binding.initializer &&
    !found.binding.dotDotDotToken &&
    hasName(found.binding.propertyName ?? found.binding.name, 'authority') &&
    property(init, 'authorized') &&
    admissionWasChecked(inventory, init.expression, init)
  );
}

function unsharedInitializer(inventory: Inventory, value: ts.Identifier) {
  const found = localBinding(inventory.symbolAt(value), value);
  if (!found || found.binding) return undefined;
  const { decl } = found;
  // Const protects the binding only. Any other reference can change the object or let it escape.
  const scope = decl.parent.parent.parent;
  const symbol = inventory.symbolAt(value);
  const shared = descendants(scope).some(
    node =>
      node !== value &&
      node !== decl.name &&
      ts.isIdentifier(node) &&
      inventory.symbolAt(node) === symbol
  );
  return shared ? undefined : decl.initializer;
}

export function suppliedField(
  inventory: Inventory,
  value: ts.Expression | undefined,
  name: string
): ts.Expression | undefined {
  if (!value) return undefined;
  if (ts.isIdentifier(value))
    return suppliedField(inventory, unsharedInitializer(inventory, value), name);
  if (!ts.isObjectLiteralExpression(value)) return undefined;
  for (const prop of [...value.properties].reverse()) {
    if (ts.isSpreadAssignment(prop) || (prop.name && ts.isComputedPropertyName(prop.name))) {
      return undefined;
    }
    if (!hasName(prop.name, name)) continue;
    if (ts.isPropertyAssignment(prop)) return prop.initializer;
    if (ts.isShorthandPropertyAssignment(prop)) return prop.name;
    return undefined;
  }
}

export function usesAdmittedTenant(inventory: Inventory, call: ts.CallExpression) {
  const [tenant] = call.arguments;
  if (!tenant || !ts.isIdentifier(tenant)) return false;
  const found = localBinding(inventory.symbolAt(tenant), tenant);
  const source = found?.decl.initializer;
  if (!found?.binding || !source || !ts.isCallExpression(source)) return false;
  return (
    hasName(found.binding.propertyName ?? found.binding.name, 'tenantId') &&
    inventory.callsExport(
      source,
      'packages/database/src/tenant-authority.ts',
      'readTenantAuthority'
    ) &&
    isAdmittedAuthority(inventory, source.arguments[0], source)
  );
}

export function admittedTransactionCallback(inventory: Inventory, fn: ts.SignatureDeclaration) {
  const call = fn.parent;
  return (
    ts.isCallExpression(call) &&
    call.arguments[1] === fn &&
    inventory.callsExport(
      call,
      'packages/database/src/tenant-authority-context.ts',
      'withTenantAuthority',
      { allowNamespace: true }
    ) &&
    isAdmittedAuthority(inventory, call.arguments[0], call)
  );
}

export function isAdmittedTransaction(inventory: Inventory, value: ts.Expression | undefined) {
  if (!value || !ts.isIdentifier(value)) return false;
  const param = inventory.symbolAt(value)?.valueDeclaration;
  return Boolean(
    param &&
    ts.isParameter(param) &&
    ts.isFunctionLike(param.parent) &&
    param.parent.parameters[0] === param &&
    admittedTransactionCallback(inventory, param.parent)
  );
}
