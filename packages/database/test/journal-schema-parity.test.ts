import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { catalogFacts, factKey, TWIN_SCHEMA } from './journal-schema-parity.catalog';
import {
  type DrizzleSnapshot,
  structuralFacts,
  twinStatements,
} from './journal-schema-parity.declared';
import {
  ABSENT,
  byCodeUnit,
  compareWithExpectedModel,
  declaredModel,
  missingDeclaredIndexes,
  type Registry,
  REVIEWED_DRIFT,
  tenantDefaults,
} from './journal-schema-parity.support';

// CHK-12, fourth part: the comparison rules and the declared model, without a database. The
// database run, with the mutation cases, is test/pg16/journal-schema-parity.test.ts.
const here = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.resolve(here, '../drizzle');
const registry = JSON.parse(
  readFileSync(path.resolve(here, '../../../scripts/ci/sql-managed-objects.json'), 'utf8')
) as Registry;
const journal = JSON.parse(readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'));
const tags: string[] = journal.entries.map((entry: { tag: string }) => entry.tag);
const snapshot = JSON.parse(
  readFileSync(path.join(drizzleDir, 'meta', `${tags.at(-1)?.slice(0, 4)}_snapshot.json`), 'utf8')
) as DrizzleSnapshot;

const key = (kind: string, ...parts: unknown[]) => factKey(kind, parts);
const INDEX = key('index', 'public', 'claim', 'idx_claims_user_created');
const POLICY = key('policy', 'public', 'claim', 'tenant_isolation_claim');

test('equal facts pass; a missing, changed or unexplained fact fails with its key', () => {
  const declared = new Map([[INDEX, 'btree (a)']]);
  const none = { objects: [] };
  assert.deepEqual(compareWithExpectedModel(declared, none, declared, { drift: [] }), []);
  assert.deepEqual(compareWithExpectedModel(declared, none, new Map(), { drift: [] }), [
    { key: INDEX, problem: 'missing', expected: 'btree (a)' },
  ]);
  assert.deepEqual(
    compareWithExpectedModel(declared, none, new Map([[INDEX, 'btree (a DESC)']]), { drift: [] }),
    [{ key: INDEX, problem: 'changed', expected: 'btree (a)', actual: 'btree (a DESC)' }]
  );
  const extra = new Map([...declared, [POLICY, 'permissive for all']]);
  assert.deepEqual(compareWithExpectedModel(declared, none, extra, { drift: [] }), [
    { key: POLICY, problem: 'unexplained', actual: 'permissive for all' },
  ]);
  // Values are compared exactly: PostgreSQL rendered both, so no whitespace is normalized away.
  const spaced = new Map([[INDEX, "btree (a) WHERE (b = 'x  y'::text)"]]);
  const single = new Map([[INDEX, "btree (a) WHERE (b = 'x y'::text)"]]);
  assert.equal(compareWithExpectedModel(single, none, spaced, { drift: [] }).length, 1);
});

test('the registry adds SQL-only facts and can never override a declared one', () => {
  const declared = new Map([[INDEX, 'btree (a)']]);
  const sqlOnly = { objects: [{ key: POLICY, value: 'p', migration: tags[86] }] };
  assert.deepEqual(
    compareWithExpectedModel(declared, sqlOnly, new Map([...declared, [POLICY, 'p']]), {
      drift: [],
    }),
    []
  );
  assert.deepEqual(compareWithExpectedModel(declared, sqlOnly, declared, { drift: [] }), [
    { key: POLICY, problem: 'registry-missing', expected: 'p' },
  ]);
  const override = { objects: [{ key: INDEX, value: 'btree (b)', migration: tags[1] }] };
  const built = new Map([[INDEX, 'btree (b)']]);
  assert.deepEqual(compareWithExpectedModel(declared, override, built, { drift: [] }), [
    { key: INDEX, problem: 'registry-declares', expected: 'btree (a)', actual: 'btree (b)' },
    { key: INDEX, problem: 'changed', expected: 'btree (a)', actual: 'btree (b)' },
  ]);
  const twice = { objects: [sqlOnly.objects[0], sqlOnly.objects[0]] };
  assert.throws(
    () => compareWithExpectedModel(declared, twice, declared),
    /duplicate registry key/u
  );
});

test('drift is admitted only by exact key and both values, and goes stale when either moves', () => {
  const drift = [
    { key: INDEX, declared: 'btree (a)', built: 'btree (b)', migration: tags[1], reason: 'r' },
  ];
  const none = { objects: [] };
  const declared = new Map([[INDEX, 'btree (a)']]);
  assert.deepEqual(
    compareWithExpectedModel(declared, none, new Map([[INDEX, 'btree (b)']]), { drift }),
    []
  );
  assert.deepEqual(
    compareWithExpectedModel(declared, none, new Map([[INDEX, 'btree (c)']]), { drift }),
    [{ key: INDEX, problem: 'changed', expected: 'btree (b)', actual: 'btree (c)' }]
  );
  const moved = new Map([[INDEX, 'btree (z)']]);
  assert.equal(
    compareWithExpectedModel(moved, none, new Map([[INDEX, 'btree (b)']]), { drift })[0].problem,
    'drift-stale'
  );
  const absent = [{ ...drift[0], built: ABSENT }];
  assert.deepEqual(compareWithExpectedModel(declared, none, new Map(), { drift: absent }), []);
  assert.equal(
    compareWithExpectedModel(declared, none, declared, { drift: absent })[0].problem,
    'changed'
  );
});

test('the reviewed drift is the four pinned cases, each declared exactly as reviewed', () => {
  assert.deepEqual(
    REVIEWED_DRIFT.map(entry => entry.key),
    [
      key('enum', 'public', 'document_category'),
      key('fk', 'public', 'agent_clients', ['tenant_id'], 'public', 'tenants', ['id']),
      key('fk', 'public', 'crm_routing_rules', ['branch_id'], 'public', 'branches', ['id']),
      key('check', 'public', 'sponsors', 'sponsors_legal_name_check'),
    ]
  );
  const structural = structuralFacts(snapshot);
  for (const entry of REVIEWED_DRIFT) {
    assert.ok(tags.includes(entry.migration), entry.migration);
    assert.ok(entry.reason.length >= 40, entry.key);
    // Checks are rendered by PostgreSQL in the database run; structural drift is checked here.
    if (!entry.key.startsWith('check '))
      assert.equal(structural.get(entry.key), entry.declared, entry.key);
  }
});

test('the registry file is sorted, unique, attributed, and declares nothing the snapshot does', () => {
  const keys = registry.objects.map(entry => entry.key);
  assert.deepEqual(keys, [...keys].sort(byCodeUnit));
  assert.equal(new Set(keys).size, keys.length);
  const structural = structuralFacts(snapshot);
  for (const entry of registry.objects) {
    assert.ok(tags.includes(entry.migration), `${entry.key}: ${entry.migration}`);
    assert.equal(typeof entry.value, 'string', entry.key);
    assert.equal(structural.has(entry.key), false, `${entry.key} is declared`);
    assert.deepEqual(Object.keys(entry).sort(byCodeUnit), ['key', 'migration', 'value']);
  }
  // The split facts: the snapshot names the view and enables RLS on sponsors; SQL owns the rest.
  assert.ok(keys.includes(key('view-definition', 'public', 'tenant_entity_boundaries')));
  assert.ok(keys.includes(key('relation-options', 'public', 'tenant_entity_boundaries')));
  assert.ok(keys.includes(key('rls-force', 'public', 'sponsors')));
  assert.equal(structural.get(key('rls', 'public', 'sponsors')), 'enabled');
  assert.equal(structural.get(key('relation', 'public', 'tenant_entity_boundaries')), 'view');
  const claimPolicy = registry.objects.find(entry => entry.key === POLICY);
  assert.equal(claimPolicy?.migration, tags[86]);
});

const tiny: DrizzleSnapshot = {
  tables: {
    'public.t': {
      name: 't',
      schema: '',
      columns: {
        id: { name: 'id', type: 'text', primaryKey: true, notNull: true },
        state: { name: 'state', type: 'status', typeSchema: 'public', default: "'open'" },
        n: { name: 'n', type: 'integer' },
      },
      indexes: {
        t_state_idx: {
          name: 't_state_idx',
          columns: [
            { expression: 'state', isExpression: false, asc: false, nulls: 'first' },
            { expression: 'lower(id)', isExpression: true, asc: true, nulls: 'last' },
          ],
          isUnique: true,
          method: 'btree',
          where: "state = 'open'",
          with: {},
        },
      },
      checkConstraints: { t_n_check: { name: 't_n_check', value: '"t"."n" > 0' } },
      policies: {
        t_p: {
          name: 't_p',
          as: 'PERMISSIVE',
          for: 'SELECT',
          to: ['public', 'app_role'],
          using: 'true',
        },
      },
      compositePrimaryKeys: {},
      uniqueConstraints: {
        t_n_uq: { name: 't_n_uq', columns: ['n', 'state'], nullsNotDistinct: true },
      },
      foreignKeys: {
        t_fk: {
          tableTo: 'u',
          columnsFrom: ['n'],
          columnsTo: ['id'],
          onDelete: 'cascade',
          onUpdate: 'no action',
        },
      },
      isRLSEnabled: false,
    },
  },
  enums: { 'public.status': { name: 'status', schema: 'public', values: ['open', 'closed'] } },
};

test('the twin statements build every declared expression for PostgreSQL to render', () => {
  const twin = `"${TWIN_SCHEMA}"`;
  assert.deepEqual(
    twinStatements(tiny).map(statement => statement.sql),
    [
      `create schema ${twin}`,
      `create table ${twin}."t" ("id" text not null, "state" "public"."status" default 'open', "n" integer)`,
      `alter table ${twin}."t" add constraint "t_n_check" check ("t"."n" > 0)`,
      `create unique index "t_state_idx" on ${twin}."t" using btree ("state" desc nulls first, (lower(id)) asc nulls last) where (state = 'open')`,
      `create policy "t_p" on ${twin}."t" as PERMISSIVE for SELECT to public, "app_role" using (true)`,
    ]
  );
});

test('the structural facts follow the catalog spelling, and RLS is stated only when managed', () => {
  assert.deepEqual(
    [...structuralFacts(tiny)],
    [
      [key('schema', 'public'), 'schema'],
      [key('relation', 'public', 't'), 'table'],
      [key('pk', 'public', 't'), 't_pkey ["id"]'],
      [key('unique', 'public', 't', 't_n_uq'), '["n","state"] nulls not distinct'],
      [
        key('fk', 'public', 't', ['n'], 'public', 'u', ['id']),
        'delete=cascade update=no action match=s',
      ],
      [key('enum', 'public', 'status'), '["open","closed"]'],
    ]
  );
  const long = 'x'.repeat(60);
  const longTable = {
    ...tiny.tables['public.t'],
    name: long,
    uniqueConstraints: {},
    foreignKeys: {},
  };
  const facts = structuralFacts({ tables: { long: longTable }, enums: {} });
  assert.equal(facts.get(key('pk', 'public', long)), `${'x'.repeat(58)}_pkey ["id"]`);
});

test('parts of a snapshot the model does not cover are refused, not ignored', () => {
  const table = tiny.tables['public.t'];
  for (const variant of [
    { tables: { s: { ...table, schema: 'audit' } }, enums: {} },
    {
      tables: { s: { ...table, columns: { id: { name: 'id', type: 'integer', identity: {} } } } },
      enums: {},
    },
    { tables: {}, enums: {}, views: { v: { name: 'v', columns: {}, definition: 'select 1' } } },
    { tables: {}, enums: {}, sequences: { s: {} } },
  ] as DrizzleSnapshot[]) {
    assert.throws(() => twinStatements(variant), /the parity model does not cover/u);
  }
});

test('catalog rows map the twin back to its schema and refuse a repeated key', () => {
  const rows = [{ kind: 'index', parts: [TWIN_SCHEMA, 't', 'i'], value: 'btree (a)' }];
  assert.deepEqual(
    [...catalogFacts(rows, 'public')],
    [[key('index', 'public', 't', 'i'), 'btree (a)']]
  );
  // Keys are JSON: a dot in a name cannot make two objects share one key.
  const dotted = [
    { kind: 'index', parts: ['public', 'a.b', 'c'], value: '1' },
    { kind: 'index', parts: ['public', 'a', 'b.c'], value: '2' },
  ];
  assert.equal(catalogFacts(dotted).size, 2);
  assert.throws(() => catalogFacts([...rows, ...rows]), /duplicate catalog key/u);
  assert.throws(
    () => declaredModel(new Map([[INDEX, 'x']]), new Map([[INDEX, 'x']])),
    /states .* twice/u
  );
});

test('the independent checks: a tenant default and a missing declared index fail by key', () => {
  const tenantDefault = key('default', 'audit', 'any_table', 'tenant_id');
  const built = new Map([
    [tenantDefault, "'ks'::text"],
    [key('default', 'public', 't', 'tenant_id_hint'), "'x'::text"],
  ]);
  assert.deepEqual(tenantDefaults(built), [tenantDefault]);
  assert.deepEqual(missingDeclaredIndexes(new Map([[INDEX, 'btree (a)']]), built), [INDEX]);
});
