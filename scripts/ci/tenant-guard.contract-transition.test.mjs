import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTRACTS } from './tenant-guard/manifest.mjs';
import { sha256 } from './tenant-guard/rules.mjs';
import { fingerprint, parseSource, collectUnits, unitName } from './tenant-guard/syntax.mjs';
import { assertRefused, file, run } from './tenant-guard-test-support.mjs';

// An open contract transition: a unit may carry its reviewed predecessor contract and one exact
// successor postimage, so protected main and the candidate both pass. Every other source fails,
// and the entry that the measured source does not carry is excused only while its sibling is
// matched and fully used.
const PATH = 'apps/web/src/attack.ts';
const bodyWith = sql => [
  'export async function lockRow(tx: any, sql: any, id: string) {',
  `  await tx.execute(sql\`${sql}\`);`,
  '}',
];
const PREVIOUS = bodyWith('select 1 from claims where id = ${id} for update');
const NEXT = bodyWith('select 1 from claims where id = ${id} for share');

function contractFor(body, kinds = { execute: 1 }) {
  const sourceFile = parseSource(PATH, body.join('\n'));
  const [unit] = collectUnits(sourceFile).filter(
    candidate => unitName(candidate, sourceFile) === 'lockRow'
  );
  const digest = sha256(fingerprint(unit, sourceFile));
  return { file: PATH, unit: 'lockRow', kinds, sha256: digest, reason: 'fixture row lock' };
}
const TRANSITION = [contractFor(PREVIOUS), contractFor(NEXT)];

test('an open transition admits the predecessor and the successor postimage alone', () => {
  assert.deepEqual(run(file(PREVIOUS), { contracts: TRANSITION }).violations, []);
  assert.deepEqual(run(file(NEXT), { contracts: TRANSITION }).violations, []);

  const other = run(file(bodyWith('select 2 from claims where id = ${id} for update')), {
    contracts: TRANSITION,
  });
  assertRefused(other, 'C3', /execute needs a source-bound contract/u);
  const unused = other.violations.filter(violation => violation.rule === 'contract');
  assert.equal(unused.length, 2, JSON.stringify(other.violations));
});

test('the excused sibling needs a fully used match; extra operations stay refused', () => {
  const wide = [contractFor(PREVIOUS), contractFor(NEXT, { execute: 2 })];
  const partial = run(file(NEXT), { contracts: wide });
  assertRefused(partial, 'contract', /execute: contract admits 2, source has 1/u);
  assertRefused(partial, 'contract', /execute: contract admits 1, source has 0/u);

  const twice = [...NEXT.slice(0, 2), NEXT[1], NEXT[2]];
  const over = run(file(twice), { contracts: TRANSITION });
  assertRefused(over, 'C3', /execute needs a source-bound contract/u);
});

test('a unit admits one predecessor and one distinct successor at most', () => {
  const third = contractFor(bodyWith('select 3 from claims where id = ${id} for update'));
  const crowded = run(file(NEXT), { contracts: [...TRANSITION, third] });
  assertRefused(crowded, 'contract', /one predecessor and one distinct successor at most/u);

  const duplicate = run(file(NEXT), { contracts: [contractFor(NEXT), contractFor(NEXT)] });
  assertRefused(duplicate, 'contract', /one predecessor and one distinct successor at most/u);
  const shared = contractFor(NEXT);
  const reused = run(file(NEXT), { contracts: [shared, shared] });
  assertRefused(reused, 'contract', /one predecessor and one distinct successor at most/u);
});

// A contract names one AST unit. Another unit bearing the same name (here an object method) never
// borrows the reviewed unit's digest or budget, whichever of the two the scan meets first.
const methodNamed = body => [
  'export const tools = {',
  '  async lockRow(tx: any, sql: any, id: string) {',
  `    await tx.execute(sql\`${body}\`);`,
  '  },',
  '};',
];

test('a second unit bearing a contracted name fails closed and excuses nothing', () => {
  const contract = contractFor(PREVIOUS, { execute: 2 });
  const stolen = run(file([...PREVIOUS, ...methodNamed('select 9 from claims')]), {
    contracts: [contract],
  });
  assertRefused(stolen, 'contract', /the contracted name is borne by more than one unit/u);
  assertRefused(stolen, 'C3', /execute needs a source-bound contract/u);

  for (const order of [
    [...PREVIOUS, ...methodNamed('select 1 from claims where id = ${id} for share')],
    [...methodNamed('select 1 from claims where id = ${id} for share'), ...PREVIOUS],
  ]) {
    const both = run(file(order), { contracts: TRANSITION });
    assertRefused(both, 'contract', /the contracted name is borne by more than one unit/u);
  }
});

test('repository contract transitions name at most two distinct postimages per unit', () => {
  const units = new Map();
  for (const contract of CONTRACTS) {
    const key = `${contract.file}#${contract.unit}`;
    units.set(key, [...(units.get(key) ?? []), contract.sha256]);
  }
  for (const [key, digests] of units) {
    assert.ok(digests.length <= 2, `${key} has ${digests.length} contracts`);
    assert.equal(new Set(digests).size, digests.length, `${key} repeats a postimage`);
  }
});
