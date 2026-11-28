import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { readReleaseJournal, sha256 } from '../../src/release-migrations';
import { quoteIdentifier } from '../rls-test-connection';
import { assertLedger, assertRefusal, type withReleaseDatabase } from './release-migration-fixture';
import { folder, policy, workspace } from './release-migration-journal.fixture';
import type { ScratchClient } from './scratch-database';

export const guard = 'interdomestik_wp12_guard';
export const writer = 'interdomestik_wp12_receipt_writer';
export const verifier = 'interdomestik_wp12_verifier';
export const runtime = 'interdomestik_runtime_rls';
export const grantor = 'foreign_owner_test_grantor';
export const dedicated = [guard, writer];
const fixtureRoles = [...dedicated, verifier, runtime, grantor];
export const tag0114 = '0114_wp12_1_inbound_documents';
const tag0115 = '0115_case_tenant_binding';
export const lock = 'public.claim_inbound_lock_staff_branch(text,text)';
export const receipt =
  'public.record_claim_inbound_object_verification(uuid,text,text,integer,text)';
const triggers = [
  'claim_inbound_document_home_guard_fn',
  'claim_inbound_decision_actor_scope_guard_fn',
  'claim_inbound_staff_scope_guard_fn',
  'claim_inbound_owner_guard_fn',
  'claim_received_document_actor_scope_guard_fn',
];
export const signatures = [lock, receipt, ...triggers.map(name => `public.${name}()`)];
export const codes = {
  public: 'MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED',
  owner: 'PUBLIC_FOREIGN_OWNER_UNADMITTED',
  role: 'PUBLIC_FOREIGN_OWNER_ROLE_POSTURE',
  definition: 'PUBLIC_FOREIGN_OWNER_DEFINITION_MISMATCH',
  ledger: 'PUBLIC_FOREIGN_OWNER_LEDGER_INCONSISTENT',
};

export type Fixture = Parameters<Parameters<typeof withReleaseDatabase>[2]>[1];
const source114 = () => readFileSync(join(folder, `${tag0114}.sql`), 'utf8');

export function candidate(t: TestContext, through = 115) {
  const dir = workspace(t);
  const journalPath = join(dir, 'meta/_journal.json');
  const raw: {
    version: string;
    entries: { idx: number; when: number; tag: string; version: string; breakpoints: boolean }[];
  } = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
  assert.equal(raw.entries[114]?.tag, tag0114);
  assert.equal(raw.entries[115]?.tag, tag0115);
  const entries = raw.entries.slice(0, through + 1);
  mkdirSync(join(dir, 'meta'));
  const writeJournal = (suffix = entries) =>
    writeFileSync(journalPath, JSON.stringify({ ...raw, entries: suffix }));
  writeJournal();
  for (const { tag } of entries) copyFileSync(join(folder, `${tag}.sql`), join(dir, `${tag}.sql`));
  return { dir, entries, writeJournal };
}

export function repin(fixture: Fixture, dir: string) {
  const { journalSha256, ledgerSha256, registrySha256 } = readReleaseJournal(dir, policy, {
    candidateRoot: dir,
    policyRoot: folder,
  });
  writeFileSync(
    fixture.files('config.json'),
    JSON.stringify({ ...fixture.config, journalSha256, ledgerSha256, registrySha256 })
  );
}

export async function presentRoles(client: ScratchClient) {
  const rows = await client<{ name: string; oid: string }[]>`
    SELECT rolname::text AS name, oid::text AS oid FROM pg_catalog.pg_roles
    WHERE rolname IN ${client(fixtureRoles)} ORDER BY rolname
  `;
  return [...rows];
}

export async function enrolledOwner(client: ScratchClient) {
  const [row] = await client<{ name: string }[]>`
    SELECT datdba::regrole::text AS name FROM pg_catalog.pg_database
    WHERE datname = current_database()
  `;
  return quoteIdentifier(row.name);
}

export async function to0113(client: ScratchClient, fixture: Fixture) {
  const plan = await fixture.expand();
  assert.equal(plan.expand.tag, '0112_wp07_rate_check_expand');
  assert.equal(plan.contract?.tag, '0113_wp07_rate_check_contract');
  await assertLedger(client, fixture.journal, 113);
  const result = await fixture.run('contract', fixture.approval());
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'contracted');
  await assertLedger(client, fixture.journal, 114);
  // expand() overwrites manifest.json on success. Keep the signed 0113 input bytes separately.
  const original = fixture.files('contract-0113.json');
  writeFileSync(original, readFileSync(fixture.files('manifest.json')));
  return { RELEASE_PHASE_MANIFEST: original };
}

export async function verifyRecovery(
  fixture: Fixture,
  manifest: { RELEASE_PHASE_MANIFEST: string }
) {
  const result = await fixture.run('recover', manifest);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'verified-committed');
}

export function lockDefinition() {
  const statement = source114()
    .split('--> statement-breakpoint')
    .find(part =>
      part.trimStart().startsWith('CREATE FUNCTION public.claim_inbound_lock_staff_branch(')
    );
  assert.ok(statement);
  return statement;
}

export async function restoreEarlyCatalog(client: ScratchClient) {
  const owner = await enrolledOwner(client);
  await client.begin(async tx => {
    await tx.unsafe(`SET LOCAL ROLE ${owner}`);
    for (const sql of source114().split('--> statement-breakpoint')) await tx.unsafe(sql).simple();
  });
}

export async function memberships(client: ScratchClient) {
  const rows = await client`
    SELECT r.rolname::text AS owner, m.member::regrole::text AS member, m.grantor::int AS grantor,
      m.admin_option AS admin, m.inherit_option AS inherit, m.set_option AS can_set
    FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid = m.roleid
    WHERE r.rolname IN ${client(dedicated)} ORDER BY r.rolname, m.member, m.grantor
  `;
  return [...rows];
}

export async function assertCatalog(client: ScratchClient) {
  const rows = await client`
    SELECT p.oid::int AS oid, p.proname::text AS name, p.proowner::regrole::text AS owner,
      p.prosrc AS body, p.proconfig AS settings, p.prorettype::regtype::text AS result,
      p.prokind AS kind, l.lanname::text AS language, p.prosecdef AS definer,
      p.provolatile AS volatility, p.proparallel AS parallel, p.proargnames AS arguments,
      NOT (p.proretset OR p.proisstrict OR p.proleakproof) AND p.procost = 100 AND p.prorows = 0
        AND p.prosupport = 0::oid AND p.provariadic = 0::oid AND p.pronargdefaults = 0
        AND p.proargdefaults IS NULL AND p.proallargtypes IS NULL AND p.proargmodes IS NULL
        AND p.protrftypes IS NULL AND p.probin IS NULL AND p.prosqlbody IS NULL AS ordinary_options
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE p.oid IN (SELECT to_regprocedure(signature) FROM unnest(${client.array(signatures)}::text[]) signature)
    ORDER BY p.proname
  `;
  assert.equal(rows.length, signatures.length);
  const statements = source114().split('--> statement-breakpoint');
  for (const row of rows) {
    const recorded = row.name === 'record_claim_inbound_object_verification';
    const branch = row.name === 'claim_inbound_lock_staff_branch';
    const original = statements.find(part =>
      part.trimStart().startsWith(`CREATE FUNCTION public.${row.name}(`)
    );
    assert.ok(original);
    assert.equal(sha256(row.body), sha256(original.split('$$')[1]), row.name);
    assert.deepEqual(
      {
        owner: row.owner,
        settings: row.settings,
        result: row.result,
        kind: row.kind,
        language: row.language,
        definer: row.definer,
        volatility: row.volatility,
        parallel: row.parallel,
        arguments: row.arguments,
        ordinaryOptions: row.ordinary_options,
      },
      {
        owner: recorded ? writer : guard,
        settings: recorded
          ? ['search_path=pg_catalog, pg_temp', 'row_security=on']
          : ['search_path=pg_catalog, pg_temp'],
        result: recorded || branch ? 'boolean' : 'trigger',
        kind: 'f',
        language: 'plpgsql',
        definer: true,
        volatility: 'v',
        parallel: 'u',
        ordinaryOptions: true,
        arguments: recorded
          ? ['p_decision_id', 'p_bucket', 'p_path', 'p_file_size', 'p_sha256']
          : branch
            ? ['p_tenant', 'p_branch']
            : null,
      },
      row.name
    );
  }
  const deps = await client`
    SELECT d.objid::int AS oid, r.rolname::text AS owner,
      d.dbid = db.oid AND d.classid = 'pg_catalog.pg_proc'::regclass AND d.objsubid = 0 AS exact
    FROM pg_catalog.pg_shdepend d JOIN pg_catalog.pg_roles r ON r.oid = d.refobjid
    CROSS JOIN pg_catalog.pg_database db
    WHERE db.datname = current_database() AND d.refclassid = 'pg_catalog.pg_authid'::regclass
      AND deptype = 'o' AND r.rolname IN ${client(dedicated)}
    ORDER BY d.objid
  `;
  assert.deepEqual(
    [...deps],
    [...rows].sort((a, b) => a.oid - b.oid).map(({ oid, owner }) => ({ oid, owner, exact: true }))
  );
}

export async function assert0115(client: ScratchClient) {
  const sql = readFileSync(join(folder, `${tag0115}.sql`), 'utf8');
  const expected = [...sql.matchAll(/\bVALIDATE CONSTRAINT (\w+)/gu)]
    .map(([, name]) => name)
    .sort();
  assert.equal(expected.length, 14);
  const rows = await client`
    SELECT conname::text AS name FROM pg_catalog.pg_constraint
    WHERE convalidated AND contype = 'f' AND conname IN ${client(expected)} ORDER BY conname
  `;
  assert.deepEqual(
    rows.map(row => row.name),
    expected
  );
}

export async function attempts(client: ScratchClient) {
  const [row] = await client`
    SELECT to_regclass('drizzle.__release_contract_attempts') IS NOT NULL AS present
  `;
  if (!row.present) return [];
  return [...(await client`SELECT nonce FROM drizzle.__release_contract_attempts ORDER BY nonce`)];
}

// System catalog row versions detect changes without returning their definitions or ACL contents.
export async function publicCatalogSnapshot(client: ScratchClient) {
  return [
    ...(await client`
    WITH public_ns AS (
      SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'public'
    ), facts AS (
      SELECT 'namespace' AS kind, oid, xmin FROM pg_catalog.pg_namespace WHERE oid IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'relation', oid, xmin FROM pg_catalog.pg_class WHERE relnamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'type', oid, xmin FROM pg_catalog.pg_type WHERE typnamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'routine', oid, xmin FROM pg_catalog.pg_proc WHERE pronamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'constraint', oid, xmin FROM pg_catalog.pg_constraint WHERE connamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'trigger', t.oid, t.xmin FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        WHERE c.relnamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'operator', oid, xmin FROM pg_catalog.pg_operator WHERE oprnamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'collation', oid, xmin FROM pg_catalog.pg_collation WHERE collnamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'conversion', oid, xmin FROM pg_catalog.pg_conversion WHERE connamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'opclass', oid, xmin FROM pg_catalog.pg_opclass WHERE opcnamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'opfamily', oid, xmin FROM pg_catalog.pg_opfamily WHERE opfnamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'configuration', oid, xmin FROM pg_catalog.pg_ts_config WHERE cfgnamespace IN (SELECT oid FROM public_ns)
      UNION ALL SELECT 'dictionary', oid, xmin FROM pg_catalog.pg_ts_dict WHERE dictnamespace IN (SELECT oid FROM public_ns)
    )
    SELECT md5(string_agg(kind || ':' || oid::text || ':' || xmin::text, ',' ORDER BY kind, oid)) AS hash
    FROM facts
  `),
  ];
}

export async function refuseExpandUnchanged(
  client: ScratchClient,
  fixture: Fixture,
  reason: string,
  count: number
) {
  const before = await publicCatalogSnapshot(client);
  const priorAuthority = await ownerCatalogSnapshot(client);
  const priorAttempts = await attempts(client);
  assertRefusal(await fixture.run('expand'), reason);
  await assertLedger(client, fixture.journal, count);
  assert.deepEqual(await publicCatalogSnapshot(client), before);
  assert.deepEqual(await ownerCatalogSnapshot(client), priorAuthority);
  assert.deepEqual(await attempts(client), priorAttempts);
}

async function ownerCatalogSnapshot(client: ScratchClient) {
  return [
    ...(await client`
    WITH roles AS (
      SELECT o.oid, o.rolname, o.rolcanlogin, o.rolinherit, o.rolbypassrls,
        o.rolsuper, o.rolcreaterole, o.rolcreatedb, o.rolreplication
      FROM pg_catalog.pg_roles o WHERE o.rolname IN ${client(fixtureRoles)}
    ), facts AS (
      SELECT 'role' AS kind, to_jsonb(r)::text AS value FROM roles r
      UNION ALL SELECT 'membership', to_jsonb(m)::text FROM pg_catalog.pg_auth_members m
        WHERE m.roleid IN (SELECT oid FROM roles) OR m.member IN (SELECT oid FROM roles)
      UNION ALL SELECT 'dependency', to_jsonb(d)::text FROM pg_catalog.pg_shdepend d
        WHERE d.refclassid = 'pg_catalog.pg_authid'::regclass
          AND d.refobjid IN (SELECT oid FROM roles)
    )
    SELECT md5(string_agg(kind || ':' || value, ',' ORDER BY kind, value)) AS hash FROM facts
  `),
  ];
}
