import { negative, replace } from './db-access-m4-assignment-kernels-test.fixture.mjs';
const legacy = [
  [
    'literal admin no-op',
    'assignLegacyInTransaction(tx, input, true)',
    'assignLegacyInTransaction(tx, input, false)',
  ],
  [
    'literal agent write',
    'assignLegacyInTransaction(tx, input, false)',
    'assignLegacyInTransaction(tx, input, true)',
  ],
  [
    'role admission',
    "actor.role !== 'staff' && actor.role !== 'admin'",
    "actor.role !== 'staff' && actor.role !== 'member'",
  ],
  ['staff self-only', 'staffId !== actor.id', 'staffId !== claimId'],
  ['current tenant', 'eq(claims.tenantId, actor.tenantId)', 'eq(claims.tenantId, actor.id)'],
  [
    'staff branch resource scope',
    'staffResourceScope(actor, claimId)',
    'and(eq(claims.id, claimId), eq(claims.tenantId, actor.tenantId))',
  ],
  ['resource lock', ".for('update')", ".for('share')"],
  [
    'self/noop target validation',
    'staffId === null ? undefined : await lockEligibleStaff(tx, actor.tenantId, staffId, null)',
    'staffId === actor.id || staffId === null ? undefined : await lockEligibleStaff(tx, actor.tenantId, staffId, null)',
  ],
  [
    'target tenant',
    'lockEligibleStaff(tx, actor.tenantId, staffId, null)',
    'lockEligibleStaff(tx, actor.id, staffId, null)',
  ],
  [
    'target validation result',
    "if (staffId !== null && !target) return denied('Staff member not found');",
    '',
  ],
  ['terminal write denial', 'isTerminalStatus(claimStatusFromLifecycleFields(claim))', 'false'],
  ['allowed fields', '.set({ staffId })', '.set({ staffId, assignedAt: new Date() })'],
  ['CAS scope', 'and(scope, assignmentSnapshotGuard(claim))', 'scope'],
  ['write awaited', 'const rows = await tx', 'const rows = tx'],
  ['returned-row check', 'if (rows.length === 0)', 'if (rows.length < 0)'],
  ['audit awaited', 'await insertAssignmentAudit', 'insertAssignmentAudit'],
  [
    'audit previous binding',
    'claimId, claim.staffId, staffId, observation',
    'claimId, staffId, staffId, observation',
  ],
  [
    'audit removed',
    'await insertAssignmentAudit(tx, actor, claimId, claim.staffId, staffId, observation);',
    '',
  ],
  ['private notification target', 'staffId: target.id', 'staffId: actor.id'],
];
const staff = [
  ['staff role', "actor.role !== 'staff'", "actor.role !== 'admin'"],
  [
    'omitted target self',
    'input.staffId === undefined ? actor.id : input.staffId',
    'input.staffId === undefined ? null : input.staffId',
  ],
  ['resource scope', 'staffResourceScope(actor, claimId)', 'staffResourceScope(actor, actor.id)'],
  ['resource lock', ".for('update')", ".for('share')"],
  ['target branch', 'staffId, actor.branchId', 'staffId, null'],
  [
    'self/noop eligibility',
    'staffId !== null && !(await',
    'staffId !== actor.id && staffId !== null && !(await',
  ],
  [
    'noop admitted target',
    'if (claim.staffId === staffId)',
    'if (staffId === actor.id || claim.staffId === staffId)',
  ],
  ['terminal write gate', 'isTerminalStatus(claimStatusFromLifecycleFields(claim))', 'false'],
  ['timestamp assignment', 'assignedAt: staffId ? now : null', 'assignedAt: now'],
  [
    'assigned actor',
    'assignedById: staffId ? actor.id : null',
    'assignedById: staffId ? staffId : null',
  ],
  ['update time', 'updatedAt: now', 'updatedAt: null'],
  ['extra mutation field', 'updatedAt: now,', 'updatedAt: now, branchId: actor.branchId,'],
  ['CAS removed', 'and(scope, assignmentSnapshotGuard(claim))', 'scope'],
  ['returned-row check', 'if (rows.length === 0)', 'if (rows.length < 0)'],
  ['audit awaited', 'await insertAssignmentAudit', 'insertAssignmentAudit'],
  [
    'audit removed',
    'await insertAssignmentAudit(tx, actor, claimId, claim.staffId, staffId, observation);',
    '',
  ],
];
for (const [role, cases] of [
  ['legacy', legacy],
  ['staff', staff],
]) {
  for (const [label, before, after] of cases) negative(role, label, s => replace(s, before, after));
  negative(role, 'SQL failure swallowed', s =>
    replace(s, '.returning({ id: claims.id });', '.returning({ id: claims.id }).catch(() => []);')
  );
  negative(role, 'terminal gate moved before eligible noop', s => {
    const terminal =
      '  if (isTerminalStatus(claimStatusFromLifecycleFields(claim)))\n    return ' +
      (role === 'legacy' ? 'denied' : 'deny') +
      "('Cannot perform assign on a terminal claim.');\n";
    const without = replace(s, terminal, '');
    const anchor =
      role === 'legacy' ? '  if (skipNoop && !changed)' : '  if (claim.staffId === staffId)';
    return replace(without, anchor, terminal + anchor);
  });
}
