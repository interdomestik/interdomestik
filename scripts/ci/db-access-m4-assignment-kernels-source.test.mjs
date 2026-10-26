import assert from 'node:assert/strict';
import test from 'node:test';
import { FILES } from './db-access-m4-assignment-kernels-source.mjs';
import {
  sources,
  derive,
  hash,
  negative,
  replace,
} from './db-access-m4-assignment-kernels-test.fixture.mjs';
const baseline = derive();
test('actual three kernels derive ordered controls and effects without runtime authority', () => {
  assert.deepEqual(Object.keys(baseline.facts), ['shared', 'legacy', 'staff']);
  assert.equal(baseline.runtimeAdmission, false);
  assert.equal(baseline.allExecutableContextsQualified, false);
  assert.equal(baseline.productionEventAuthenticated, false);
  assert.equal(Object.keys(baseline.facts.shared.functions).length, 4);
  assert.equal(Object.keys(baseline.facts.legacy.functions).length, 4);
  assert.equal(Object.keys(baseline.facts.staff.functions).length, 1);
  for (const [role, file] of Object.entries(FILES))
    assert.equal(baseline.sourceSha256[file], hash(sources[role + 'Source']));
  assert.ok(Object.isFrozen(baseline.facts.shared.clauses.lockEligibleStaff));
  assert.ok(baseline.premises.some(x => x.includes('SQL')));
});
test('comments layout local variable names and imported aliases preserve semantic facts', () => {
  const sharedSource = '// comment\n' + sources.sharedSource.replace(/\btarget\b/g, 'eligible');
  const legacySource = sources.legacySource.replace(/\brows\b/g, 'updatedRows');
  const staffSource = sources.staffSource
    .replace('{ and }', '{ and as conjunction }')
    .replace(/\band\(/g, 'conjunction(');
  assert.equal(
    derive({ sharedSource, legacySource, staffSource }).factsSha256,
    baseline.factsSha256
  );
});
const cases = [
  ['resource tenant', 'eq(claims.tenantId, actor.tenantId)', 'eq(claims.tenantId, actor.id)'],
  ['resource branch', 'eq(claims.branchId, actor.branchId)', 'eq(claims.branchId, actor.id)'],
  ['own resource', 'eq(claims.staffId, actor.id)', 'eq(claims.staffId, claimId)'],
  ['unassigned scope', 'isNull(claims.staffId))', 'isNull(claims.branchId))'],
  ['assignment CAS', 'eq(claims.staffId, claim.staffId)', 'eq(claims.staffId, claim.branchId)'],
  ['branch CAS', 'eq(claims.branchId, claim.branchId)', 'eq(claims.branchId, claim.staffId)'],
  [
    'case lifecycle CAS',
    'eq(claims.caseLifecycleState, claim.caseLifecycleState)',
    'eq(claims.caseLifecycleState, claims.caseLifecycleState)',
  ],
  [
    'recovery lifecycle CAS',
    'eq(claims.recoveryLifecycleState, claim.recoveryLifecycleState)',
    'eq(claims.recoveryLifecycleState, claims.recoveryLifecycleState)',
  ],
  ['target identity', 'eq(user.id, staffId)', 'eq(user.id, tenantId)'],
  ['target tenant', 'eq(user.tenantId, tenantId)', 'eq(user.tenantId, staffId)'],
  ['current staff eligibility', "eq(user.role, 'staff')", "eq(user.role, 'member')"],
  ['target branch', 'branchId === null ? undefined : eq(user.branchId, branchId)', 'undefined'],
  ['target lock', ".for('share')", ".for('update')"],
  ['target await', 'const [target] = await tx', 'const [target] = tx'],
  ['mandatory audit awaited', 'await tx.insert(auditLog)', 'tx.insert(auditLog)'],
  ['audit same tx', 'await tx.insert(auditLog)', 'await Promise.resolve()'],
  ['audit tenant', 'tenantId: actor.tenantId', 'tenantId: actor.id'],
  ['audit actor', 'actorId: actor.id', 'actorId: claimId'],
  ['audit next assignment', 'newStaffId: nextStaffId', 'newStaffId: previousStaffId'],
  ['observation nonauthority', 'authoritative: false', 'authoritative: true'],
  ['observation provenance', "provenance: 'web-relay-reported'", "provenance: 'backend-peer'"],
  ['observation bounded', 'observation.ip.slice(0, 256)', 'observation.ip'],
];
for (const [label, before, after] of cases)
  negative('shared', label, s => replace(s, before, after));
negative('shared', 'audit failure swallowed', s =>
  replace(s, 'await tx.insert(auditLog).values({', 'await tx.insert(auditLog).values({').replace(
    '  });\n}',
    '  }).catch(() => undefined);\n}'
  )
);
for (const role of ['shared', 'legacy', 'staff']) {
  negative(role, 'empty value import', s => "import {} from './unbound-helper';\n" + s);
  negative(role, 'extra executable path', s => s + '\nPromise.resolve();\n');
  negative(
    role,
    'ambient database import',
    s => "import { db } from '@interdomestik/database';\n" + s
  );
}
