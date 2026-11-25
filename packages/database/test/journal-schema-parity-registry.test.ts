import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { factKey } from './journal-schema-parity.catalog';
import {
  type DrizzleSnapshot,
  structuralFacts,
  twinStatements,
} from './journal-schema-parity.declared';
import {
  ABSENT,
  compareWithExpectedModel,
  type Registry,
  isSqlManagedFact,
} from './journal-schema-parity.support';

// CHK-12, fourth part: what the registry may never admit, and the view namespace. Pure; the
// comparison rules themselves are journal-schema-parity.test.ts.
const here = path.dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(
  readFileSync(path.resolve(here, '../../../scripts/ci/sql-managed-objects.json'), 'utf8')
) as Registry;
const snapshot = JSON.parse(
  readFileSync(path.resolve(here, '../drizzle/meta/0100_snapshot.json'), 'utf8')
) as DrizzleSnapshot;

const key = (kind: string, ...parts: unknown[]) => factKey(kind, parts);
const SQL_INDEX = key('index', 'public', 'claim_messages', 'idx_claim_messages_tenant_id');
const UNIQUE_INDEX = 'agent_commissions_tenant_subscription_type_uq';

test('a registry entry can never admit an absent object', () => {
  const entry = registry.objects.find(object => object.key === SQL_INDEX);
  assert.ok(entry, 'the SQL-only index is a registry entry');
  const built = new Map(registry.objects.map(object => [object.key, object.value]));
  built.delete(SQL_INDEX);
  const none = new Map<string, string>();
  const missing = compareWithExpectedModel(none, registry, built, { drift: [] });
  assert.deepEqual(missing, [
    { key: SQL_INDEX, problem: 'registry-missing', expected: entry.value },
  ]);
  // Rewriting only the registry value to the absence marker must not make the absence pass.
  const rewritten = {
    objects: registry.objects.map(object =>
      object.key === SQL_INDEX ? { ...object, value: ABSENT } : object
    ),
  };
  assert.deepEqual(compareWithExpectedModel(none, rewritten, built, { drift: [] }), [
    { key: SQL_INDEX, problem: 'registry-absent', expected: ABSENT },
  ]);
  // Built anyway, it is unexplained as well.
  const present = new Map([...built, [SQL_INDEX, entry.value]]);
  assert.deepEqual(
    compareWithExpectedModel(none, rewritten, present, { drift: [] }).map(d => d.problem),
    ['registry-absent', 'unexplained']
  );
});

test('the registry can never expect a disabled constraint or an unusable index', () => {
  for (const [abnormal, value] of [
    [key('constraint-enforcement', 'public', 'crm_routing_rules', 'fk'), 'D'],
    [key('invalid-index', 'public', 'agent_commissions', UNIQUE_INDEX), 'invalid'],
    [key('a-later-kind', 'public', 'claim'), 'x'],
  ]) {
    const admitted = { objects: [{ key: abnormal, value, migration: 'x' }] };
    const built = new Map([[abnormal, value]]);
    assert.deepEqual(compareWithExpectedModel(new Map(), admitted, built, { drift: [] }), [
      { key: abnormal, problem: 'registry-forbidden', actual: value },
      { key: abnormal, problem: 'unexplained', actual: value },
    ]);
  }
});

test('the registry file holds no absence and only the reviewed kinds', () => {
  for (const entry of registry.objects) {
    assert.notEqual(entry.value, ABSENT, entry.key);
    assert.ok(isSqlManagedFact(entry.key), entry.key);
  }
});

test('a view outside public is refused, not compared as the public view', () => {
  const views = snapshot.views ?? {};
  const [name, view] =
    Object.entries(views).find(([, v]) => v.name === 'tenant_entity_boundaries') ?? [];
  assert.ok(name && view, 'the snapshot declares the view');
  assert.equal(
    structuralFacts(snapshot).get(key('relation', 'public', 'tenant_entity_boundaries')),
    'view'
  );
  const moved = { ...snapshot, views: { ...views, [name]: { ...view, schema: 'drizzle' } } };
  assert.throws(() => structuralFacts(moved), /the parity model does not cover: view drizzle\./u);
  assert.throws(() => twinStatements(moved), /the parity model does not cover: view drizzle\./u);
});
