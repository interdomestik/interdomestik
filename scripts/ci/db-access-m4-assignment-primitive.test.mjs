import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hash,
  primitive,
  ASSIGNMENT_PRIMITIVES,
} from './db-access-m4-assignment-context.fixture.mjs';

test('finite actual-source primitive laws cover operators tenant schema lifecycle and current roles', () => {
  const v = primitive.deriveAssignmentPrimitiveSemantics(ASSIGNMENT_PRIMITIVES);
  assert.deepEqual(v.operators, ['eq', 'and', 'isNull', 'or']);
  assert(v.tenantConjunctionLaw);
  assert.equal(v.tables[0].columns.tenantId, 'tenant_id');
});

for (const [label, file, from, to] of [
  [
    'equality',
    'node_modules/drizzle-orm/sql/expressions/conditions.cjs',
    '$' + '{left} = $' + '{bindIfParam(right, left)}',
    '$' + '{left} <> $' + '{bindIfParam(right, left)}',
  ],
  [
    'conjunction',
    'node_modules/drizzle-orm/sql/expressions/conditions.js',
    'new StringChunk(" and ")',
    'new StringChunk(" or ")',
  ],
  [
    'tenant helper',
    'packages/database/src/tenant-security.ts',
    'return userConditions ? and(tenantCheck, userConditions)! : tenantCheck;',
    'return userConditions!;',
  ],
  [
    'schema tenant',
    'packages/database/src/schema/claim-core.ts',
    "tenantId: text('tenant_id')",
    "tenantId: text('foreign_id')",
  ],
  [
    'lifecycle',
    'packages/database/src/claim-lifecycle.ts',
    "case 'resolved:resolved':\n      return 'resolved';",
    "case 'resolved:resolved':\n      return 'submitted';",
  ],
  [
    'transaction callback',
    'node_modules/drizzle-orm/postgres-js/session.cjs',
    'return transaction(tx);',
    'return transaction(this);',
  ],
  [
    'current role',
    'packages/shared-auth/src/permissions.ts',
    'return role === ROLES.admin || role === ROLES.tenant_admin;',
    'return true;',
  ],
])
  test('semantic mutation refuses after matching hash refresh: ' + label, () => {
    const value = structuredClone(ASSIGNMENT_PRIMITIVES),
      r = value.files[file];
    assert(r.source.includes(from));
    r.source = r.source.replace(from, to);
    r.sha256 = hash(r.source);
    r.bytes = Buffer.byteLength(r.source);
    assert.throws(() => primitive.deriveAssignmentPrimitiveSemantics(value));
  });

test('pinned execution binding refuses wrong primitive image', () => {
  const image = Object.fromEntries(
    Object.entries(ASSIGNMENT_PRIMITIVES.files).map(([f, r]) => [
      ASSIGNMENT_PRIMITIVES.installedPaths[f] ?? f,
      { sha256: r.sha256, bytes: r.bytes },
    ])
  );
  for (const [file, link] of Object.entries(ASSIGNMENT_PRIMITIVES.rootLinks))
    image[file] = { link };
  assert.equal(
    primitive.qualifyAssignmentPrimitiveBindings(image, {
      files: Object.fromEntries(
        Object.entries(ASSIGNMENT_PRIMITIVES.files).map(([f, r]) => [
          f,
          { sha256: r.sha256, bytes: r.bytes },
        ])
      ),
    }).generalCompilerQualified,
    false
  );
  const changed = structuredClone(image);
  Object.values(changed)[0].sha256 = '0'.repeat(64);
  assert.throws(() =>
    primitive.qualifyAssignmentPrimitiveBindings(changed, {
      files: Object.fromEntries(
        Object.entries(ASSIGNMENT_PRIMITIVES.files).map(([f, r]) => [
          f,
          { sha256: r.sha256, bytes: r.bytes },
        ])
      ),
    })
  );
});

for (const [label, file, from, to] of [
  [
    'swapped operator binding',
    'node_modules/drizzle-orm/sql/expressions/conditions.cjs',
    '(left, right) =>',
    '(right, left) =>',
  ],
  [
    'rest/default binding',
    'node_modules/drizzle-orm/sql/expressions/conditions.js',
    'function and(...unfilteredConditions)',
    'function and(unfilteredConditions = [])',
  ],
  [
    'identifier table masquerading as literal',
    'packages/database/src/schema/claim-core.ts',
    "'claim'",
    'claim',
  ],
])
  test('outer source law refuses matching-hash ' + label, () => {
    const contract = structuredClone(ASSIGNMENT_PRIMITIVES),
      row = contract.files[file];
    assert(row.source.includes(from));
    row.source = row.source.replace(from, to);
    row.sha256 = hash(row.source);
    row.bytes = Buffer.byteLength(row.source);
    assert.throws(() => primitive.deriveAssignmentPrimitiveSemantics(contract));
    if (label.startsWith('identifier table')) {
      const columnContract = structuredClone(ASSIGNMENT_PRIMITIVES),
        column = columnContract.files[file];
      assert(column.source.includes("text('id')"));
      column.source = column.source.replace("text('id')", 'text(id)');
      column.sha256 = hash(column.source);
      column.bytes = Buffer.byteLength(column.source);
      assert.throws(() => primitive.deriveAssignmentPrimitiveSemantics(columnContract));
    }
  });

test('complete role source law refuses matching-hash changed and identifier initializers', () => {
  for (const [original, replacement] of [
    ["global_support: 'global_support'", "global_support: 'member'"],
    ["admin: 'admin'", 'admin: admin'],
  ]) {
    const contract = structuredClone(ASSIGNMENT_PRIMITIVES),
      record = contract.files['packages/shared-auth/src/permissions.ts'];
    assert(record.source.includes(original));
    record.source = record.source.replace(original, replacement);
    record.sha256 = hash(record.source);
    record.bytes = Buffer.byteLength(record.source);
    assert.throws(
      () => primitive.deriveAssignmentPrimitiveSemantics(contract),
      /role object literal/
    );
  }
});
