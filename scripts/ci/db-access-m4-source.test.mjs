import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { deriveM4AssignmentKernel } from './db-access-m4-source.mjs';
import { M4_KERNEL_FILE } from './db-access-m4-spec.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, M4_KERNEL_FILE), 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
const positive = deriveM4AssignmentKernel(source);
const auditStart = source.indexOf('  await tx.insert(auditLog)');
const auditEnd = source.indexOf('\n\n  return { success: true', auditStart);
assert.ok(auditStart > 0 && auditEnd > auditStart);
const audit = source.slice(auditStart, auditEnd);

function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, 'mutation anchor must occur exactly once');
  return text.replace(before, after);
}

function assertParses(text) {
  const parsed = ts.createSourceFile(
    'mutant.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  assert.equal(parsed.parseDiagnostics.length, 0, 'negative must remain valid TypeScript syntax');
}

test('derives ordered effects from the actual candidate bytes without runtime admission', () => {
  assert.equal(positive.sourceSha256, digest(source));
  assert.equal(positive.kernelPremiseOnly, true);
  assert.equal(positive.runtimeAdmission, false);
  assert.equal(positive.facts.actorRoleConsumed, false);
  assert.deepEqual(
    positive.facts.effects.map(effect => effect.step),
    [
      'read-claim',
      'deny-missing-claim',
      'deny-terminal-lifecycle',
      'read-lock-target',
      'deny-ineligible-target',
      'update-claim-assignment',
      'deny-conflict',
      'insert-audit',
      'return-success',
    ]
  );
  assert.equal(positive.facts.effects[3].lock, 'share');
  assert.equal(positive.facts.effects[7].awaited, true);
  assert.equal(positive.facts.effects[7].failurePropagates, true);
  assert.ok(positive.premises.some(premise => premise.includes('not A1 admission')));
  assert.ok(Object.isFrozen(positive.facts.effects[7].values.metadata));
  assert.throws(() => {
    positive.facts.effects[7].awaited = false;
  }, TypeError);
});

test('comments/layout and a renamed row binding preserve facts, but get their own source hash', () => {
  const formatted = '// relocated copy; no authority follows from this comment\n\n' + source;
  const renamed = formatted.replace(/\btarget\b/g, 'eligibleRow');
  const derived = deriveM4AssignmentKernel(renamed);
  assert.notEqual(derived.sourceSha256, positive.sourceSha256);
  assert.equal(derived.factsSha256, positive.factsSha256);
  assert.equal(derived.runtimeAdmission, false);
});

test('conjunct order may change while the tenant and target-role obligations stay exact', () => {
  const reordered = replaceOnce(
    source,
    'and(eq(user.id, staffId), eq(user.role, ASSIGNMENT_TARGET_ROLE))',
    'and(eq(user.role, ASSIGNMENT_TARGET_ROLE), eq(user.id, staffId))'
  );
  assert.equal(deriveM4AssignmentKernel(reordered).factsSha256, positive.factsSha256);
});

const mutants = [
  [
    'target role removed',
    'and(eq(user.id, staffId), eq(user.role, ASSIGNMENT_TARGET_ROLE))',
    'and(eq(user.id, staffId))',
  ],
  [
    'target role broadened',
    "ASSIGNMENT_TARGET_ROLE = 'staff'",
    "ASSIGNMENT_TARGET_ROLE = 'member'",
  ],
  [
    'target tenant replaced',
    '        tenantId,\n        user.tenantId,',
    "        'foreign-tenant',\n        user.tenantId,",
  ],
  [
    'target uses actor id',
    'findAssignableStaff(tx, tenantId, staffId)',
    'findAssignableStaff(tx, tenantId, actorId)',
  ],
  ['target lock weakened', ".for('share')", ".for('key share')"],
  ['target lock absent', ".for('share')", '.limit(1)'],
  [
    'claim tenant removed',
    '.where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))',
    '.where(and(eq(claims.id, claimId)))',
  ],
  [
    'claim selector accepts another id',
    '.where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))',
    '.where(and(eq(claims.id, actorId), eq(claims.tenantId, tenantId)))',
  ],
  ['missing claim denial inverted', 'if (!claim) throw', 'if (claim) throw'],
  [
    'lifecycle denial inverted',
    'if (isTerminalStatus(claimStatusFromLifecycleFields(claim)))',
    'if (!isTerminalStatus(claimStatusFromLifecycleFields(claim)))',
  ],
  ['target denial inverted', 'if (!target) return', 'if (target) return'],
  [
    'lifecycle compare removed',
    '    eq(claims.caseLifecycleState, read.caseLifecycleState),\n',
    '',
  ],
  [
    'staff compare weakened',
    'read.staffId ? eq(claims.staffId, read.staffId) : isNull(claims.staffId)',
    'eq(claims.staffId, read.staffId)',
  ],
  ['compare-and-set removed from update', ', buildAssignmentGuard(claim)))', '))'],
  [
    'update tenant removed',
    '.where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId), buildAssignmentGuard(claim)))',
    '.where(and(eq(claims.id, claimId), buildAssignmentGuard(claim)))',
  ],
  [
    'assignment writes a different staff',
    '.set({ staffId, assignedAt: now,',
    '.set({ staffId: actorId, assignedAt: now,',
  ],
  ['write not awaited', 'const updated = await tx', 'const updated = tx'],
  ['conflict ignored', 'if (updated.length === 0) return', 'if (updated.length < 0) return'],
  ['audit removed', audit, ''],
  ['audit not awaited', 'await tx.insert(auditLog)', 'tx.insert(auditLog)'],
  ['audit failure swallowed', audit, '  try {\n' + audit + '\n  } catch {}'],
  ['audit only conditional', audit, '  if (false) {\n' + audit + '\n  }'],
  ['return before audit', audit, '  return { success: true, data: updated[0] };\n' + audit],
  [
    'audit tenant wrong',
    '    tenantId,\n    actorId,\n    action:',
    "    tenantId: 'foreign-tenant',\n    actorId,\n    action:",
  ],
  ['audit receiver substituted', 'await tx.insert(auditLog)', 'await params.insert(auditLog)'],
  [
    'extra SQL before success',
    '\n  return { success: true, data: updated[0] };',
    "\n  await tx.execute('delete from claims');\n  return { success: true, data: updated[0] };",
  ],
  ['fake evidence in comments', audit, '// ' + audit.replaceAll('\n', '\n// ')],
  ['shadowed clock', 'const now = new Date();', 'const Date = params;\n  const now = new Date();'],
  [
    'unknown module-load side effect',
    "import { nanoid } from 'nanoid';",
    "import { nanoid } from 'nanoid';\nimport 'unreviewed-side-effect';",
  ],
  ['ambient client import', '  auditLog,\n', '  auditLog,\n  db,\n'],
  [
    'extra top-level execution',
    'const CLAIM_NOT_FOUND_ERROR =',
    'globalThis.run();\nconst CLAIM_NOT_FOUND_ERROR =',
  ],
  [
    'arbitrary caller transaction parameter default',
    'tx: TenantTransaction,\n  params:',
    'tx: TenantTransaction = globalThis.db,\n  params:',
  ],
];

for (const [name, before, after] of mutants) {
  test('freshly hashed semantic negative is rejected: ' + name, () => {
    const mutant = replaceOnce(source, before, after);
    assertParses(mutant);
    // Rebind the changed source instead of failing on the old source hash.
    const freshSourceHash = digest(mutant);
    assert.notEqual(freshSourceHash, positive.sourceSha256);
    assert.throws(
      () => deriveM4AssignmentKernel(mutant),
      error => error instanceof Error && error.message.startsWith('m4 kernel source rejected:')
    );
  });
}

test('a detached derivation object cannot authorize arbitrary source', () => {
  const missingAudit = replaceOnce(source, audit, '');
  const forged = { ...positive, sourceSha256: digest(missingAudit), runtimeAdmission: true };
  assert.throws(() => deriveM4AssignmentKernel(forged), /source text must be a string/);
  assert.throws(() => deriveM4AssignmentKernel(missingAudit), /mandatory audit/);
});
