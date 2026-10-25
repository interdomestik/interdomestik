// Finite AST derivation of the admin assignment kernel; necessary source premise only.
// No inventory deletion, SQL execution, context admission or active guard integration.
import ts from 'typescript';
import {
  expect,
  same,
  declare,
  deepFreeze,
  sha256,
  canonicalJson,
  parseKernel,
} from './db-access-m4-syntax.mjs';
import { enterFunction, readModule } from './db-access-m4-module.mjs';
import { predicate, transactionQuery, ref } from './db-access-m4-expression.mjs';
import { constBinding, bindingName } from './db-access-m4-statements.mjs';
import { deriveAssignment } from './db-access-m4-assignment.mjs';
import {
  M4_KERNEL_FILE,
  M4_KERNEL_PREMISES,
  GUARD,
  TARGET_ELIGIBILITY,
  FUNCTIONS,
  CONSTANTS,
} from './db-access-m4-spec.mjs';

export function deriveGuard(unit) {
  const { scope, statements } = enterFunction('buildAssignmentGuard', unit);
  const [result] = statements;
  expect(
    statements.length === 1 && ts.isReturnStatement(result) && result.expression,
    'assignment guard: body must be a single returned predicate'
  );
  const guard = predicate(result.expression, scope, 'assignment guard');
  expect(same(guard, GUARD), 'assignment guard: staff/lifecycle compare-and-set changed');
  return guard;
}

export function deriveTargetLookup(unit) {
  const label = 'target read';
  const { scope, statements } = enterFunction('findAssignableStaff', unit);
  const [read, result] = statements;
  const declaration = constBinding(read, label);
  const name = bindingName(declaration.name, label, true);
  const lookup = transactionQuery(declaration.initializer, scope, label, [
    'select',
    'from',
    'where',
    'for',
  ]);
  expect(lookup.from === 'user', `${label}: not a user read`);
  expect(same(lookup.select, { id: 'user.id' }), `${label}: projection is not the target id`);
  const scoped = lookup.where.withTenant;
  expect(
    scoped && scoped[0] === 'param:tenantId' && scoped[1] === 'user.tenantId',
    `${label}: not tenant-scoped through withTenant(tenantId, user.tenantId, ...)`
  );
  expect(
    same(scoped[2], TARGET_ELIGIBILITY),
    `${label}: predicate is not the requested staff id with the staff role`
  );
  expect(lookup.for === 'share', `${label}: eligible staff row is not locked FOR SHARE`);
  declare(scope, name, 'row:target', label);
  expect(
    statements.length === 2 &&
      ts.isReturnStatement(result) &&
      result.expression &&
      ref(result.expression, scope, label) === 'row:target',
    `${label}: helper may only return the locked row`
  );
  return {
    parameters: FUNCTIONS.findAssignableStaff.params.map(([, , descriptor]) => descriptor),
    facts: {
      receiver: 'tx',
      table: lookup.from,
      columns: lookup.select,
      where: lookup.where,
      lock: lookup.for,
      binds: 'row:target',
    },
  };
}

export function deriveM4AssignmentKernel(sourceText) {
  expect(typeof sourceText === 'string', 'source text must be a string');
  const unit = readModule(parseKernel(sourceText));
  unit.guard = deriveGuard(unit);
  const target = deriveTargetLookup(unit);
  const facts = {
    kernel: 'admin-ops-claim-assignment',
    exports: {
      function: 'assignClaimOwnerInTransaction',
      types: ['AssignClaimOwnerParams'],
      constants: Object.fromEntries(
        Object.entries(CONSTANTS)
          .filter(([, constant]) => constant.exported)
          .map(([name, constant]) => [name, constant.value])
      ),
    },
    imports: [...unit.imports].sort(),
    transaction: { receiver: 'tx', owner: 'caller', opensOrCommits: false, everyEffectOn: 'tx' },
    actorRoleConsumed: false,
    effects: deriveAssignment(unit, target),
  };
  return deepFreeze({
    version: 1,
    file: M4_KERNEL_FILE,
    sourceSha256: sha256(sourceText),
    facts,
    factsSha256: sha256(canonicalJson(facts)),
    premises: M4_KERNEL_PREMISES,
    kernelPremiseOnly: true,
    runtimeAdmission: false,
  });
}
