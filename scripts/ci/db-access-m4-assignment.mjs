// Internal finite M4 kernel derivation. No runtime admission authority.
import ts from 'typescript';
import {
  expect,
  failM4Source,
  same,
  literal,
  failure,
  allOf,
  declare,
} from './db-access-m4-syntax.mjs';
import { enterFunction } from './db-access-m4-module.mjs';
import { ref, call, value, transactionQuery } from './db-access-m4-expression.mjs';
import {
  constBinding,
  bindingName,
  guardedExit,
  negates,
  thrownDenial,
  returned,
} from './db-access-m4-statements.mjs';
import {
  CLAIM_COLUMNS,
  CLAIM_SCOPE,
  CONSTANTS,
  IS_TERMINAL,
  LIFECYCLE_STATUS,
  TARGET_FUNCTION,
  ASSIGNMENT_SET,
  GUARD,
  ASSIGNMENT_RETURNING,
  AUDIT_VALUES,
  SUCCESS,
  DENIAL,
} from './db-access-m4-spec.mjs';

export function deriveAssignment(unit, target) {
  const { scope, statements } = enterFunction('assignClaimOwnerInTransaction', unit);
  let index = 0;
  const take = label => statements[index++] ?? failM4Source(`${label}: required statement missing`);

  const binding = constBinding(take('parameter binding'), 'parameter binding');
  expect(
    ts.isObjectBindingPattern(binding.name) &&
      ref(binding.initializer, scope, 'parameter binding') === 'params',
    'parameter binding: expected const { ... } = params'
  );
  for (const element of binding.name.elements) {
    expect(
      !element.dotDotDotToken &&
        !element.propertyName &&
        !element.initializer &&
        ts.isIdentifier(element.name),
      'parameter binding: only plain shorthand fields are reviewed'
    );
    declare(scope, element.name.text, `param:${element.name.text}`, 'parameter binding');
  }
  expect(
    same(binding.name.elements.map(element => element.name.text).sort(), [
      'actorId',
      'claimId',
      'staffId',
      'tenantId',
    ]),
    'parameter binding: kernel must bind exactly actorId, claimId, staffId and tenantId'
  );

  const claimDeclaration = constBinding(take('claim read'), 'claim read');
  const claimName = bindingName(claimDeclaration.name, 'claim read', true);
  const claimRead = transactionQuery(claimDeclaration.initializer, scope, 'claim read', [
    'select',
    'from',
    'where',
    'limit',
  ]);
  expect(claimRead.from === 'claims', 'claim read: not a claims read');
  expect(
    same(claimRead.select, CLAIM_COLUMNS),
    'claim read: columns are not the staff/claim-number/lifecycle snapshot'
  );
  expect(
    same(claimRead.where, allOf(...CLAIM_SCOPE)),
    'claim read: predicate is not the exact claim id + tenant'
  );
  expect(claimRead.limit === 1, 'claim read: not limited to one row');
  declare(scope, claimName, 'row:claim', 'claim read');

  const missing = guardedExit(take('missing-claim denial'), 'missing-claim denial');
  expect(
    negates(missing.condition, scope, 'row:claim', 'missing-claim denial'),
    'missing-claim denial: condition is not the absent claim read'
  );
  const missingMessage = thrownDenial(missing.exit, scope, 'missing-claim denial');
  expect(
    missingMessage === literal(CONSTANTS.CLAIM_NOT_FOUND_ERROR.value),
    'missing-claim denial: message changed'
  );

  const terminal = guardedExit(take('lifecycle denial'), 'lifecycle denial');
  const outer = call(terminal.condition, scope, 'lifecycle denial');
  expect(
    outer.callee === IS_TERMINAL && outer.args.length === 1,
    'lifecycle denial: condition is not isTerminalStatus(...)'
  );
  const status = call(outer.args[0], scope, 'lifecycle denial');
  expect(
    status.callee === LIFECYCLE_STATUS &&
      status.args.length === 1 &&
      ref(status.args[0], scope, 'lifecycle denial') === 'row:claim',
    'lifecycle denial: status is not derived from the claim read lifecycle pair'
  );
  const terminalMessage = thrownDenial(terminal.exit, scope, 'lifecycle denial');
  expect(
    terminalMessage === literal(CONSTANTS.TERMINAL_CLAIM_ERROR.value),
    'lifecycle denial: message changed'
  );

  const targetDeclaration = constBinding(take('target read'), 'target read');
  const targetName = bindingName(targetDeclaration.name, 'target read', false);
  expect(ts.isAwaitExpression(targetDeclaration.initializer), 'target read: lookup is not awaited');
  const lookup = call(targetDeclaration.initializer.expression, scope, 'target read');
  expect(
    lookup.callee === TARGET_FUNCTION &&
      same(
        lookup.args.map(arg => ref(arg, scope, 'target read')),
        target.parameters
      ),
    'target read: lookup is not findAssignableStaff(tx, tenantId, staffId)'
  );
  declare(scope, targetName, 'row:target', 'target read');

  const ineligible = guardedExit(take('target denial'), 'target denial');
  expect(
    negates(ineligible.condition, scope, 'row:target', 'target denial'),
    'target denial: condition is not the absent eligible target'
  );
  const targetDenial = returned(ineligible.exit, scope, 'target denial');
  expect(
    same(targetDenial, failure(CONSTANTS.ASSIGNMENT_TARGET_DENIED_ERROR.value)),
    'target denial: result changed'
  );

  const clock = constBinding(take('assignment timestamp'), 'assignment timestamp');
  expect(
    value(clock.initializer, scope, 'assignment timestamp') === 'clock:new Date()',
    'assignment timestamp: expected new Date()'
  );
  declare(
    scope,
    bindingName(clock.name, 'assignment timestamp', false),
    'clock:now',
    'assignment timestamp'
  );

  const updateDeclaration = constBinding(take('guarded update'), 'guarded update');
  const updatedName = bindingName(updateDeclaration.name, 'guarded update', false);
  const update = transactionQuery(updateDeclaration.initializer, scope, 'guarded update', [
    'update',
    'set',
    'where',
    'returning',
  ]);
  expect(update.update === 'claims', 'guarded update: not a claims update');
  expect(same(update.set, ASSIGNMENT_SET), 'guarded update: assignment fields changed');
  expect(
    same(
      update.where,
      allOf(...CLAIM_SCOPE, { guard: { snapshot: 'row:claim', predicate: GUARD } })
    ),
    'guarded update: predicate is not exact claim id + tenant + staff/lifecycle compare-and-set of the claim read'
  );
  expect(same(update.returning, ASSIGNMENT_RETURNING), 'guarded update: returned fields changed');
  declare(scope, updatedName, 'rows:updated', 'guarded update');

  const conflict = guardedExit(take('conflict denial'), 'conflict denial');
  const { condition } = conflict;
  expect(
    ts.isBinaryExpression(condition) &&
      condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ref(condition.left, scope, 'conflict denial') === 'rows:updated.length' &&
      ts.isNumericLiteral(condition.right) &&
      condition.right.text === '0',
    'conflict denial: condition is not updated.length === 0'
  );
  const conflictDenial = returned(conflict.exit, scope, 'conflict denial');
  expect(
    same(conflictDenial, failure(CONSTANTS.ASSIGNMENT_CONFLICT_ERROR.value)),
    'conflict denial: result changed'
  );

  // Awaited, unguarded and after the matched update: a failure propagates to the caller's rollback.
  const audit = take('mandatory audit');
  expect(
    ts.isExpressionStatement(audit),
    'mandatory audit: expected an awaited tx.insert(auditLog) statement without try/catch or branching'
  );
  const auditInsert = transactionQuery(audit.expression, scope, 'mandatory audit', [
    'insert',
    'values',
  ]);
  expect(auditInsert.insert === 'auditLog', 'mandatory audit: not an auditLog insert');
  expect(same(auditInsert.values, AUDIT_VALUES), 'mandatory audit: audit row shape changed');

  const successResult = returned(take('success result'), scope, 'success result');
  expect(same(successResult, SUCCESS), 'success result: result changed');
  expect(index === statements.length, 'unaccounted executable statement after the success result');

  return [
    {
      step: 'read-claim',
      receiver: 'tx',
      table: claimRead.from,
      columns: claimRead.select,
      where: claimRead.where,
      limit: claimRead.limit,
      lock: null,
      binds: 'row:claim',
    },
    { step: 'deny-missing-claim', when: '!row:claim', throws: DENIAL, message: missingMessage },
    {
      step: 'deny-terminal-lifecycle',
      when: 'isTerminalStatus(claimStatusFromLifecycleFields(row:claim))',
      throws: DENIAL,
      message: terminalMessage,
    },
    { step: 'read-lock-target', ...target.facts },
    { step: 'deny-ineligible-target', when: '!row:target', returns: targetDenial },
    {
      step: 'update-claim-assignment',
      receiver: 'tx',
      table: update.update,
      set: update.set,
      where: update.where,
      returning: update.returning,
      binds: 'rows:updated',
    },
    { step: 'deny-conflict', when: 'rows:updated.length === 0', returns: conflictDenial },
    {
      step: 'insert-audit',
      receiver: 'tx',
      table: auditInsert.insert,
      awaited: true,
      failurePropagates: true,
      values: auditInsert.values,
    },
    { step: 'return-success', returns: successResult },
  ];
}
