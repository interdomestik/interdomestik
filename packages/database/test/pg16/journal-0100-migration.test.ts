// WP-04, migration 0100 (R-12 expand only): on a database that already holds one of its objects,
// the migration keeps an equivalent object and refuses any other, and a refusal leaves 0100
// unapplied, so the migrator never records it over an incompatible object.
//   pnpm db:journal:parity   (the server it needs: scratch-database.ts)
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  migrateJournal,
  type ScratchClient,
  scratchServerConfigured,
  withScratchDatabase,
} from './scratch-database';

const here = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.resolve(here, '../../drizzle');
const journal = JSON.parse(readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'));
const BEFORE = '0099_acq3b_sponsor_seats';
const TAG = '0100_wp04_journal_schema_parity';
const tags: string[] = journal.entries.map((entry: { tag: string }) => entry.tag);
// Located by tag, so a later migration does not move what this suite builds.
const BEFORE_COUNT = tags.indexOf(BEFORE) + 1;
const THROUGH_COUNT = tags.indexOf(TAG) + 1;

// The journal up to and including `tag`, in a folder of its own that the test removes.
function journalThrough(t: TestContext, tag: string): string {
  const position = tags.indexOf(tag);
  assert.ok(position >= 0, `${tag} is journaled`);
  const folder = mkdtempSync(path.join(tmpdir(), 'wp04-0100-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  cpSync(drizzleDir, folder, { recursive: true });
  const entries = journal.entries.slice(0, position + 1);
  writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  return folder;
}

// The ledger and every object 0100 touches: the four index definitions, the column with its type,
// nullability, default and collation, and one tenant default.
async function state(client: ScratchClient) {
  const [row] = await client.unsafe(`select
    (select count(*)::int from drizzle.__drizzle_migrations) as applied,
    (select coalesce(json_object_agg(i.relname, pg_get_indexdef(i.oid) order by i.relname), '{}')
      from pg_class i join pg_namespace n on n.oid = i.relnamespace
      where n.nspname = 'public' and i.relkind = 'i' and i.relname in (
        'agent_commissions_tenant_subscription_type_uq', 'branches_tenant_code_uq',
        'idx_claims_user_created', 'idx_policies_user_tenant_created')) as indexes,
    (select json_build_object('type', format_type(a.atttypid, a.atttypmod), 'not_null',
        a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid), 'collation', a.attcollation::regcollation::text)
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'public.crm_activities'::regclass and a.attname = 'description'
        and not a.attisdropped) as description,
    (select column_default from information_schema.columns where table_schema = 'public'
      and table_name = 'claim' and column_name = 'tenant_id') as claim_tenant_default`);
  return row;
}

const EQUIVALENT = [
  'create unique index agent_commissions_tenant_subscription_type_uq on agent_commissions (tenant_id, subscription_id, type)',
  'create unique index branches_tenant_code_uq on branches (tenant_id, code)',
  'create index idx_claims_user_created on claim ("userId", "createdAt")',
  'create index idx_policies_user_tenant_created on policies (user_id, tenant_id, created_at)',
  'alter table crm_activities add column description text',
  // A foreign key that references the standalone unique index does not make it a constraint's.
  'create table wp04_branch_ref (tenant_id text, code text, foreign key (tenant_id, code) references branches (tenant_id, code))',
];

const DECLARED_INDEXES = {
  agent_commissions_tenant_subscription_type_uq:
    'CREATE UNIQUE INDEX agent_commissions_tenant_subscription_type_uq ON public.agent_commissions USING btree (tenant_id, subscription_id, type)',
  branches_tenant_code_uq:
    'CREATE UNIQUE INDEX branches_tenant_code_uq ON public.branches USING btree (tenant_id, code)',
  idx_claims_user_created:
    'CREATE INDEX idx_claims_user_created ON public.claim USING btree ("userId", "createdAt")',
  idx_policies_user_tenant_created:
    'CREATE INDEX idx_policies_user_tenant_created ON public.policies USING btree (user_id, tenant_id, created_at)',
};
const DECLARED_COLUMN = { type: 'text', not_null: false, default: null, collation: '"default"' };

const indexRefusal = (name: string) =>
  new RegExp(`^WP-04: index ${name} exists with another definition$`, 'u');
const COLUMN_REFUSAL = /^WP-04: crm_activities\.description exists with another definition$/u;

const INCOMPATIBLE: readonly [string, string, RegExp][] = [
  [
    'key order',
    'create index idx_claims_user_created on claim ("createdAt", "userId")',
    indexRefusal('idx_claims_user_created'),
  ],
  [
    'uniqueness',
    'create index branches_tenant_code_uq on branches (tenant_id, code)',
    indexRefusal('branches_tenant_code_uq'),
  ],
  [
    'predicate',
    `create unique index branches_tenant_code_uq on branches (tenant_id, code) where code <> ''`,
    indexRefusal('branches_tenant_code_uq'),
  ],
  [
    'descending key',
    'create index idx_policies_user_tenant_created on policies (user_id, tenant_id, created_at desc)',
    indexRefusal('idx_policies_user_tenant_created'),
  ],
  [
    'NULLS NOT DISTINCT',
    'create unique index agent_commissions_tenant_subscription_type_uq on agent_commissions (tenant_id, subscription_id, type) nulls not distinct',
    indexRefusal('agent_commissions_tenant_subscription_type_uq'),
  ],
  [
    'collation',
    'create unique index branches_tenant_code_uq on branches (tenant_id, code collate "C")',
    indexRefusal('branches_tenant_code_uq'),
  ],
  [
    'operator class',
    'create unique index branches_tenant_code_uq on branches (tenant_id text_pattern_ops, code)',
    indexRefusal('branches_tenant_code_uq'),
  ],
  [
    'index owned by a unique constraint',
    'alter table branches add constraint branches_tenant_code_uq unique (tenant_id, code)',
    indexRefusal('branches_tenant_code_uq'),
  ],
  // Each column attribute alone.
  [
    'NOT NULL column',
    'alter table crm_activities add column description text not null',
    COLUMN_REFUSAL,
  ],
  [
    'column default',
    `alter table crm_activities add column description text default ''`,
    COLUMN_REFUSAL,
  ],
  ['column type', 'alter table crm_activities add column description varchar', COLUMN_REFUSAL],
  [
    'column collation',
    'alter table crm_activities add column description text collate "C"',
    COLUMN_REFUSAL,
  ],
];

test('0100 keeps equivalent objects and refuses incompatible ones without being recorded', async t => {
  if (!scratchServerConfigured(t, 'REQUIRE_JOURNAL_SCHEMA_PARITY')) return;
  const before0100 = journalThrough(t, BEFORE);
  const through0100 = journalThrough(t, TAG);

  await t.test('absent objects are created and equivalent ones kept', async () => {
    await withScratchDatabase('wp04_0100_kept', async client => {
      await migrateJournal(client, before0100);
      const prior = await state(client);
      assert.equal(prior.applied, BEFORE_COUNT);
      assert.notEqual(
        prior.claim_tenant_default,
        null,
        'the default 0100 removes exists before it'
      );
      for (const statement of EQUIVALENT) await client.unsafe(statement);
      await migrateJournal(client, through0100);
      assert.deepEqual(await state(client), {
        applied: THROUGH_COUNT,
        indexes: DECLARED_INDEXES,
        description: DECLARED_COLUMN,
        claim_tenant_default: null,
      });
    });
  });

  await t.test(
    'a same-name table earlier in the search_path is never the one changed',
    async () => {
      await withScratchDatabase('wp04_0100_shadow', async client => {
        await migrateJournal(client, before0100);
        await client.unsafe('create schema wp04_shadow');
        await client.unsafe(
          `create table wp04_shadow.claim (tenant_id text default 'tenant_shadow')`
        );
        // One connection: the migrator runs in this session, with the shadow schema first.
        await client.unsafe('set search_path to wp04_shadow, public');
        await migrateJournal(client, through0100);
        const [row] = await client.unsafe(`select
        (select column_default from information_schema.columns where table_schema = 'wp04_shadow'
          and table_name = 'claim' and column_name = 'tenant_id') as shadow_default,
        (select column_default from information_schema.columns where table_schema = 'public'
          and table_name = 'claim' and column_name = 'tenant_id') as public_default`);
        assert.deepEqual(
          { ...row },
          { shadow_default: "'tenant_shadow'::text", public_default: null }
        );
      });
    }
  );

  for (const [name, statement, refusal] of INCOMPATIBLE) {
    await t.test(`an incompatible object (${name}) leaves 0100 unapplied`, async () => {
      await withScratchDatabase('wp04_0100_refused', async client => {
        await migrateJournal(client, before0100);
        await client.unsafe(statement);
        const prior = await state(client);
        // The migrator wraps the database error, whose message quotes the migration's SQL text;
        // only the cause carries the refusal that was raised.
        await assert.rejects(migrateJournal(client, through0100), (error: unknown) => {
          const cause = error instanceof Error ? error.cause : undefined;
          assert.ok(cause instanceof Error, 'the migrator reports the database error as its cause');
          assert.match(cause.message, refusal);
          return true;
        });
        assert.deepEqual(await state(client), prior);
        assert.equal(prior.applied, BEFORE_COUNT);
      });
    });
  }
});
