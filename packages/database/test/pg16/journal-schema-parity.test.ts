// CHK-12, fourth part (R-12; DB-BASELINE DB-27, DB-28): build a scratch database from the journal
// on a disposable server, compare it with the expected model, prove that each kind of difference
// is reported by its key, then drop it.
//   pnpm db:journal:parity   (the server it needs: scratch-database.ts)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { factKey } from '../journal-schema-parity.catalog';
import {
  type DrizzleSnapshot,
  structuralFacts,
  twinStatements,
} from '../journal-schema-parity.declared';
import {
  inRolledBackTransaction,
  readBuiltFacts,
  readDeclaredRendering,
} from '../journal-schema-parity.reader';
import {
  compareWithExpectedModel,
  declaredModel,
  describeDifferences,
  missingDeclaredIndexes,
  type ParityProblem,
  type Registry,
  tenantDefaults,
} from '../journal-schema-parity.support';
import { migrateJournal, scratchServerConfigured, withScratchDatabase } from './scratch-database';

const here = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.resolve(here, '../../drizzle');
const registry = JSON.parse(
  readFileSync(path.resolve(here, '../../../../scripts/ci/sql-managed-objects.json'), 'utf8')
) as Registry;
const journal = JSON.parse(readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'));
const newest = `${String(journal.entries.length - 1).padStart(4, '0')}_snapshot.json`;
const snapshot = JSON.parse(
  readFileSync(path.join(drizzleDir, 'meta', newest), 'utf8')
) as DrizzleSnapshot;

const k = (kind: string, ...parts: unknown[]) => factKey(kind, parts);
const MEMBER_INDEX = k('index', 'public', 'user', 'user_member_number_idx');
const COUNTRY_CHECK = k('check', 'public', 'user', 'user_residence_country_check');
const dropCountry = 'alter table "user" drop constraint user_residence_country_check';
const addCountry = (pattern: string, suffix = '') =>
  `alter table "user" add constraint user_residence_country_check check (residence_country is null or residence_country ~ '${pattern}')${suffix}`;

// Each mutation runs in a rolled-back transaction and must be reported by its key.
const TENANT_BRANCH_FK = 'crm_routing_rules_tenant_branch_fk';
const MUTATIONS: readonly { name: string; sql: string[]; expect: [string, ParityProblem][] }[] = [
  {
    name: 'a declared policy expression',
    sql: [
      'alter policy claim_information_request_evidence_tenant_policy on claim_information_request_evidence using (true)',
    ],
    expect: [
      [
        k(
          'policy',
          'public',
          'claim_information_request_evidence',
          'claim_information_request_evidence_tenant_policy'
        ),
        'changed',
      ],
    ],
  },
  {
    name: 'an SQL-managed policy expression',
    sql: ['alter policy tenant_isolation_claim on claim using (true)'],
    expect: [[k('policy', 'public', 'claim', 'tenant_isolation_claim'), 'changed']],
  },
  {
    name: 'an index key order',
    sql: [
      'drop index user_member_number_idx',
      `create unique index user_member_number_idx on "user" (member_number desc) where role = 'member'`,
    ],
    expect: [[MEMBER_INDEX, 'changed']],
  },
  {
    name: 'an index predicate',
    sql: [
      'drop index user_member_number_idx',
      `create unique index user_member_number_idx on "user" (member_number) where role = 'agent'`,
    ],
    expect: [[MEMBER_INDEX, 'changed']],
  },
  {
    name: 'an index key moved behind INCLUDE',
    sql: [
      'drop index user_member_number_idx',
      `create unique index user_member_number_idx on "user" (id) include (member_number) where role = 'member'`,
    ],
    expect: [[MEMBER_INDEX, 'changed']],
  },
  {
    name: 'a declared index dropped',
    sql: ['drop index idx_claims_user_created'],
    expect: [[k('index', 'public', 'claim', 'idx_claims_user_created'), 'missing']],
  },
  {
    name: 'an index left invalid',
    sql: [
      `update pg_index set indisvalid = false where indexrelid = 'public.user_member_number_idx'::regclass`,
    ],
    expect: [[k('invalid-index', 'public', 'user', 'user_member_number_idx'), 'unexplained']],
  },
  {
    name: 'a check expression',
    sql: [dropCountry, addCountry('^[A-Z]{3}$')],
    expect: [[COUNTRY_CHECK, 'changed']],
  },
  {
    name: 'a check left unvalidated',
    sql: [dropCountry, addCountry('^[A-Z]{2}$', ' not valid')],
    expect: [[k('not-valid', 'public', 'user', 'user_residence_country_check'), 'unexplained']],
  },
  {
    name: 'a column default',
    sql: [`alter table "user" alter column role set default 'member'`],
    expect: [[k('default', 'public', 'user', 'role'), 'changed']],
  },
  {
    name: 'a tenant default',
    sql: [`alter table claim alter column tenant_id set default 'ks'`],
    expect: [[k('default', 'public', 'claim', 'tenant_id'), 'unexplained']],
  },
  {
    name: 'forced row-level security',
    sql: ['alter table claim force row level security'],
    expect: [[k('rls-force', 'public', 'claim'), 'unexplained']],
  },
  {
    name: 'row-level security disabled',
    sql: [
      'alter table claim disable row level security',
      'alter table claim_information_request_evidence disable row level security',
    ],
    expect: [
      [k('rls', 'public', 'claim'), 'registry-missing'],
      [k('rls', 'public', 'claim_information_request_evidence'), 'missing'],
    ],
  },
  {
    name: 'a function definition',
    sql: ['alter function billing_invoices_scope_guard_fn() cost 4321'],
    expect: [[k('function', 'public', 'billing_invoices_scope_guard_fn()'), 'changed']],
  },
  {
    name: 'a trigger disabled',
    sql: ['alter table billing_invoices disable trigger billing_invoices_scope_guard_trg'],
    expect: [
      [k('trigger', 'public', 'billing_invoices', 'billing_invoices_scope_guard_trg'), 'changed'],
    ],
  },
  {
    name: 'an object outside public',
    sql: ['create schema wp04_probe', 'create table wp04_probe.t (id integer)'],
    expect: [
      [k('schema', 'wp04_probe'), 'unexplained'],
      [k('relation', 'wp04_probe', 't'), 'unexplained'],
      [k('column', 'wp04_probe', 't', 'id'), 'unexplained'],
    ],
  },
  {
    name: 'a foreign key made deferrable',
    sql: [
      `do $m$ declare found_name text; begin
         select conname into strict found_name from pg_constraint
           where conrelid = 'public.claim'::regclass and contype = 'f' and confrelid = 'public.branches'::regclass
             and conkey = array[(select attnum from pg_attribute where attrelid = 'public.claim'::regclass and attname = 'branch_id')];
         execute format('alter table public.claim alter constraint %I deferrable', found_name);
       end $m$`,
    ],
    expect: [[k('fk', 'public', 'claim', ['branch_id'], 'public', 'branches', ['id']), 'changed']],
  },
  {
    name: 'a primary key column order',
    sql: [
      'alter table claim_counters drop constraint claim_counters_tenant_id_year_pk',
      'alter table claim_counters add constraint claim_counters_tenant_id_year_pk primary key (year, tenant_id)',
    ],
    expect: [[k('pk', 'public', 'claim_counters'), 'changed']],
  },
  {
    name: 'a view option',
    sql: ['alter view tenant_entity_boundaries set (security_invoker = false)'],
    expect: [[k('relation-options', 'public', 'tenant_entity_boundaries'), 'changed']],
  },
  {
    // Disabling a key's internal triggers stops its enforcement while pg_constraint is unchanged.
    name: 'a disabled tenant-and-branch key',
    sql: [
      `do $$ declare t record; begin
        for t in select tgname from pg_trigger where tgrelid = 'crm_routing_rules'::regclass
          and tgconstraint = (select oid from pg_constraint where conname = '${TENANT_BRANCH_FK}')
        loop execute format('alter table crm_routing_rules disable trigger %I', t.tgname); end loop;
      end $$`,
    ],
    expect: [
      [k('constraint-enforcement', 'public', 'crm_routing_rules', TENANT_BRANCH_FK), 'unexplained'],
    ],
  },
  {
    name: 'a column type',
    sql: ['alter table "user" alter column residence_country type varchar(2)'],
    expect: [[k('column', 'public', 'user', 'residence_country'), 'changed']],
  },
  {
    name: 'an enum label',
    sql: [`alter type document_category add value 'wp04_probe'`],
    expect: [[k('enum', 'public', 'document_category'), 'changed']],
  },
];

test('a database built from the journal equals the declared schema plus the registry', async t => {
  if (!scratchServerConfigured(t, 'REQUIRE_JOURNAL_SCHEMA_PARITY')) return;
  await withScratchDatabase('journal_parity', async client => {
    await migrateJournal(client, drizzleDir);
    // The built facts are read before the twin exists; both reads use the same search_path.
    const built = await readBuiltFacts(client);
    const { rendered, unbuildable } = await readDeclaredRendering(client, twinStatements(snapshot));
    const declared = declaredModel(structuralFacts(snapshot), rendered);
    const compare = (facts: ReadonlyMap<string, string>) =>
      compareWithExpectedModel(declared, registry, facts, { unbuildable });

    const differences = compare(built);
    assert.deepEqual(differences, [], describeDifferences(differences));
    assert.deepEqual(tenantDefaults(built), []);
    assert.deepEqual(missingDeclaredIndexes(declared, built), []);

    const mutated = (sql: readonly string[]) =>
      inRolledBackTransaction(client, async transaction => {
        for (const statement of sql) await transaction.unsafe(statement);
        return readBuiltFacts(transaction);
      });
    for (const mutation of MUTATIONS) {
      await t.test(`reports ${mutation.name}`, async () => {
        const reported = compare(await mutated(mutation.sql));
        for (const [key, problem] of mutation.expect) {
          assert.ok(
            reported.some(difference => difference.key === key && difference.problem === problem),
            `${problem} ${key} not reported:\n${describeDifferences(reported)}`
          );
        }
      });
    }
    await t.test(
      'the independent checks see a tenant default and a dropped declared index',
      async () => {
        const facts = await mutated([
          `alter table claim alter column tenant_id set default 'ks'`,
          'drop index idx_claims_user_created',
        ]);
        assert.deepEqual(tenantDefaults(facts), [k('default', 'public', 'claim', 'tenant_id')]);
        assert.deepEqual(missingDeclaredIndexes(declared, facts), [
          k('index', 'public', 'claim', 'idx_claims_user_created'),
        ]);
      }
    );
    await t.test('two quoted defaults that differ only in spacing stay different', async () => {
      const role = k('default', 'public', 'user', 'role');
      const single = (
        await mutated([`alter table "user" alter column role set default 'a b'`])
      ).get(role);
      const double = (
        await mutated([`alter table "user" alter column role set default 'a  b'`])
      ).get(role);
      assert.notEqual(single, double);
    });
    await t.test('every mutation was rolled back', async () => {
      // Map equality ignores order: the catalog query has none.
      assert.deepEqual(await readBuiltFacts(client), built);
    });
  });
});
