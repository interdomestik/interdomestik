import ts from 'typescript';
import {
  callableDeclaration,
  localBinding,
  previousStatements,
} from './member-acceptance-ast.test-support';
import {
  descendants,
  type Declaration,
  type loadInventory,
} from './member-acceptance-inventory.test-support';

import {
  admittedTransactionCallback,
  isAdmittedAuthority,
  isAdmittedTransaction,
  refusesBranch,
  suppliedField,
  usesAdmittedTenant,
} from './member-acceptance-authority.test-support';

type Inventory = ReturnType<typeof loadInventory>;
type ReaderCall = { file: string; call: ts.CallExpression; target: Declaration };
const readerFile = 'packages/domain-claims/src/claims/information-requests.ts';

function usesType(
  inventory: Inventory,
  type: ts.TypeNode | undefined,
  name: string,
  seen = new Set<ts.Symbol>()
): boolean {
  if (!type) return false;
  return descendants(type)
    .filter(ts.isTypeReferenceNode)
    .some(node => {
      const symbol = inventory.resolvedSymbol(node.typeName);
      // Treat an unresolved authority type conservatively as a protected signature.
      if (!symbol) return node.typeName.getText() === name;
      if (symbol.name === name) return true;
      if (seen.has(symbol)) return false;
      seen.add(symbol);
      return (
        symbol.declarations?.some(
          decl => ts.isTypeAliasDeclaration(decl) && usesType(inventory, decl.type, name, seen)
        ) ?? false
      );
    });
}

function callableNodes(decl: ts.Node) {
  if (!ts.isVariableDeclaration(decl)) return [decl];
  const init = decl.initializer;
  if (!init) return [];
  if (ts.isCallExpression(init)) return [...init.arguments];
  return [init];
}

export function takesAuthority(inventory: Inventory, decl: ts.Node) {
  return callableNodes(decl)
    .filter(ts.isFunctionLike)
    .some(fn =>
      fn.parameters.some(
        param =>
          /\b(?:authority|authorized|session)\b/iu.test(param.getText()) ||
          usesType(inventory, param.type, 'TenantAuthority') ||
          usesType(inventory, param.type, 'AuthorizedSession')
      )
    );
}

function readerName(target: Declaration) {
  const { decl } = target;
  return ts.isFunctionDeclaration(decl) || ts.isVariableDeclaration(decl)
    ? decl.name?.getText()
    : undefined;
}

function takesTransaction(
  inventory: Inventory,
  target: Declaration,
  param: ts.ParameterDeclaration
) {
  return (
    target.file.startsWith('packages/domain-') &&
    usesType(inventory, param.type, 'TenantTransaction')
  );
}

function isPageReader(inventory: Inventory, target: Declaration) {
  const name = readerName(target);
  if (name === 'readTenantLocaleMetadata' && target.file.startsWith('packages/database/'))
    return true;
  if (name === 'withTenantAuthority') return true;
  return (
    callableDeclaration(target.decl)?.parameters.some(
      param =>
        usesType(inventory, param.type, 'TenantAuthority') ||
        takesTransaction(inventory, target, param)
    ) ?? false
  );
}

function checkCall(inventory: Inventory, use: ReaderCall, fail: (message: string) => never) {
  const { file, call, target } = use;
  const name = readerName(target) ?? call.expression.getText();
  if (name === 'readTenantLocaleMetadata' && target.file.startsWith('packages/database/')) {
    if (!usesAdmittedTenant(inventory, call)) {
      fail(`protected reader ${name} lacks a tenant from admission in ${file}`);
    }
    inventory.assertReaderContext(
      call,
      (fn, use) => use !== call && admittedTransactionCallback(inventory, fn)
    );
    return true;
  }
  const params = callableDeclaration(target.decl)?.parameters ?? [];
  const transactionReader =
    params.some(param => takesTransaction(inventory, target, param)) &&
    !params.some(param => usesType(inventory, param.type, 'TenantAuthority'));
  const isProjection =
    name === 'readTenantAuthority' && target.file === 'packages/database/src/tenant-authority.ts';
  inventory.assertReaderContext(
    call,
    (fn, use) =>
      (transactionReader || isProjection || use !== call) &&
      admittedTransactionCallback(inventory, fn)
  );

  for (const [index, param] of params.entries()) {
    checkArgument(inventory, use, name, param, index, fail);
  }
  return true;
}

function checkArgument(
  inventory: Inventory,
  { file, call, target }: ReaderCall,
  name: string,
  param: ts.ParameterDeclaration,
  index: number,
  fail: (message: string) => never
) {
  const value = call.arguments[index];
  if (
    (name === 'withTenantAuthority' && index === 0) ||
    usesType(inventory, param.type, 'TenantAuthority')
  ) {
    const authority = suppliedField(inventory, value, 'authority') ?? value;
    if (!isAdmittedAuthority(inventory, authority, call)) {
      fail(`protected reader ${name} lacks same-request admitted authority in ${file}`);
    }
  }
  if (takesTransaction(inventory, target, param)) {
    const tx = suppliedField(inventory, value, 'tx') ?? value;
    if (!isAdmittedTransaction(inventory, tx)) {
      fail(`protected reader ${name} lacks a transaction from admission in ${file}`);
    }
  }
}

export function verifyReaderCalls(
  inventory: Inventory,
  ref: Declaration,
  fail: (message: string) => never
) {
  return inventory
    .readerCalls(ref, target => isPageReader(inventory, target))
    .map(use => checkCall(inventory, use, fail));
}

function staffClaimAuthority(inventory: Inventory, call: ts.CallExpression) {
  const value = call.arguments[1];
  if (!value || !ts.isIdentifier(value)) return false;
  const origin = localBinding(inventory.symbolAt(value), value)?.decl.initializer;
  if (!origin || !ts.isAwaitExpression(origin) || !ts.isCallExpression(origin.expression))
    return false;
  const producer = 'apps/web/src/features/staff/claims/server/authorize-staff-claim-page.ts';
  if (
    !inventory.callsExport(origin.expression, producer, 'authorizeStaffClaimPage') ||
    origin.expression.arguments[0]?.getText() !== 'session.user'
  )
    return false;
  const refused = previousStatements(call).flatMap(statement =>
    ts.isIfStatement(statement) && refusesBranch(statement.thenStatement)
      ? [statement.expression]
      : []
  );
  const authority = inventory.symbolAt(value);
  return (
    refused.some(
      check =>
        ts.isPrefixUnaryExpression(check) &&
        check.operator === ts.SyntaxKind.ExclamationToken &&
        inventory.symbolAt(check.operand) === authority
    ) &&
    refused.some(
      check =>
        check.getText() ===
        "session.user.role !== 'staff' && session.user.role !== 'branch_manager'"
    )
  );
}

export function verifyInformationRequestCallSites(inventory: Inventory) {
  const callers = inventory.webCallsTo(readerFile, 'getInformationRequests');
  const staffPage = 'apps/web/src/app/[locale]/(staff)/staff/claims/[id]/page.tsx';
  for (const { file, call } of callers) {
    inventory.assertReaderContext(call, () => false);
    if (isAdmittedAuthority(inventory, call.arguments[1], call)) continue;
    if (file === staffPage && staffClaimAuthority(inventory, call)) continue;
    throw new Error(`getInformationRequests lacks same-request admitted authority in ${file}`);
  }
}
