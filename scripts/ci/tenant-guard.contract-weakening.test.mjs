import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from './tenant-guard/rules.mjs';
import { collectUnits, fingerprint, parseSource, unitName } from './tenant-guard/syntax.mjs';
import { assertRefused, file, run } from './tenant-guard-test-support.mjs';

// P1 (agreed continuity map, GUARD-CONTINUITY-070): a source-bound C3 contract admits exactly the
// reviewed unit. Dropping its role check or weakening its tenant/branch predicate is a different
// unit and is refused; the reviewed unit itself stays accepted.

const FILE = 'apps/web/src/attack.ts';
const REVIEWED = [
  'export async function closeBranchClaim(tx: any, sql: any, actor: any, id: string) {',
  "  if (actor.role !== 'branch_manager') throw new Error('forbidden');",
  '  await tx.execute(',
  '    sql`update claims set status = ${"closed"} where id = ${id} and tenant_id = ${actor.tenantId} and branch_id = ${actor.branchId}`',
  '  );',
  '}',
];

function contractFor(lines) {
  const source = parseSource(FILE, lines.join('\n'));
  const [unit] = collectUnits(source).filter(c => unitName(c, source) === 'closeBranchClaim');
  return {
    file: FILE,
    unit: 'closeBranchClaim',
    kinds: { execute: 1 },
    sha256: sha256(fingerprint(unit, source)),
    reason: 'fixture branch-scoped claim close inside the caller tenant transaction',
  };
}

const contract = contractFor(REVIEWED);
const evaluateWith = lines => run(file(lines), { contracts: [contract] });

function assertNoLongerAdmitted(lines) {
  const result = evaluateWith(lines);
  assertRefused(result, 'C3', /execute needs a source-bound contract/u);
  assertRefused(result, 'contract', /contract admits 1, source has 0/u);
}

test('P1: the reviewed C3 unit with its role check and full predicate is admitted', () => {
  assert.deepEqual(evaluateWith(REVIEWED).violations, []);
});

test('P1: removing the role check inside the contracted unit is refused', () => {
  assertNoLongerAdmitted(
    REVIEWED.filter(line => !line.includes("actor.role !== 'branch_manager'"))
  );
});

test('P1: weakening the role check to an always-true form is refused', () => {
  assertNoLongerAdmitted(
    REVIEWED.map(line =>
      line.replace("actor.role !== 'branch_manager'", "actor.role === '__never__'")
    )
  );
});

test('P1: dropping the branch or tenant predicate inside the contracted unit is refused', () => {
  for (const clause of [
    ' and branch_id = ${actor.branchId}',
    ' and tenant_id = ${actor.tenantId}',
  ]) {
    assertNoLongerAdmitted(REVIEWED.map(line => line.replace(clause, '')));
  }
});
