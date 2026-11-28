import {
  queryPublicSchema,
  requirePublicSchema,
  type PublicProbe,
} from './migration-execution-bootstrap';
import {
  MigrationExecutionFault,
  type MigrationExecutionSql,
} from './migration-execution-contracts';
import type { JournalEntry } from './release-migration-journal';

const anchor = {
  idx: 114,
  tag: '0114_wp12_1_inbound_documents',
  when: 1795724107768,
  hash: 'd0516c13878ef0be2ba4a3ba46580bd49bbd24c05b18a65a329633886a5e9336',
} satisfies JournalEntry;

const guard = 'interdomestik_wp12_guard';
const writer = 'interdomestik_wp12_receipt_writer';
const searchPath = '20bd6867b3d59c73bbacde2d9a7e7acd1be5b3c154993be84f528ba9d185bd6d';
const rowSecurity = '5c1033f20729376065f1c2ea0e1af2b9b4807444168ac373a6b609b58c6331be';

const triggerGuards = [
  [
    'claim_inbound_document_home_guard_fn',
    '04fc6b013570e391c5932b75c504f3e10b07dc5f93e5616482640205fd595a69',
  ],
  [
    'claim_inbound_decision_actor_scope_guard_fn',
    'e51522fd91d643a9d047f518a96598b856e22456098c0703389a4d5de5f7e6d2',
  ],
  [
    'claim_inbound_staff_scope_guard_fn',
    'cb0d77cd3afffd0b0809e8e1d2d90257cdd84dd0d3ec46cd6b7db6711b676424',
  ],
  [
    'claim_inbound_owner_guard_fn',
    '42da7efa39a10bc853d957aee9f78c2b0ee7cda7e90573e3cca4ab4ccbf19701',
  ],
  [
    'claim_received_document_actor_scope_guard_fn',
    '36d7923768f137b9bd5f5552d4e4ea520ce63846789e7a3f0b19de55245a4633',
  ],
] as const;

const functions = [
  ...triggerGuards.map(([routine, body_hash]) => ({
    routine,
    body_hash,
    owner_name: guard,
    input_types: [],
    result_type: 'trigger',
    argument_names: null,
    setting_hashes: [searchPath],
  })),
  {
    routine: 'claim_inbound_lock_staff_branch',
    body_hash: '8f19d3f5f756f044e239366fb320d6ce5d486d44cdc9400bee2edbfbb45a38e6',
    owner_name: guard,
    input_types: ['text', 'text'],
    result_type: 'bool',
    argument_names: ['p_tenant', 'p_branch'],
    setting_hashes: [searchPath],
  },
  {
    routine: 'record_claim_inbound_object_verification',
    body_hash: '68b7a5c58c382f7094fe18392a2b888b5ffb0b0bbfd428e4599f4edf285c8feb',
    owner_name: writer,
    input_types: ['uuid', 'text', 'text', 'int4', 'text'],
    result_type: 'bool',
    argument_names: ['p_decision_id', 'p_bucket', 'p_path', 'p_file_size', 'p_sha256'],
    setting_hashes: [searchPath, rowSecurity],
  },
];

const inconsistent = 'PUBLIC_FOREIGN_OWNER_LEDGER_INCONSISTENT';

export function checkReleaseOwnerAnchor(entries: readonly JournalEntry[]): boolean {
  if (entries.length <= anchor.idx) return false;
  const entry = entries[anchor.idx];
  if (
    entry?.idx !== anchor.idx ||
    entry.tag !== anchor.tag ||
    entry.when !== anchor.when ||
    entry.hash !== anchor.hash
  )
    throw new Error(inconsistent);
  return true;
}

export function checkReleaseOwnerPrefix(identityCount: number, ledgerCount: number): void {
  const expected = ledgerCount <= anchor.idx ? 0 : functions.length;
  if (identityCount !== expected) throw new Error(inconsistent);
}

type ReleasePublicProbe = PublicProbe & {
  identity_count: number;
  ownership_rejected: boolean;
  role_rejected: boolean;
  definition_rejected: boolean;
};

export async function observeReleasePublicSchema(sql: MigrationExecutionSql, expectedPid: number) {
  const publicSchemaRejected = 'MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED';
  const rows = await sql<ReleasePublicProbe[]>`
    WITH public_schema AS MATERIALIZED (
      SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'public'
    ), migration_role AS MATERIALIZED (
      SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user
    ), expected AS MATERIALIZED (
      SELECT entry.*, ARRAY(
        SELECT ('pg_catalog.' || arg.type_name)::regtype::oid
        FROM pg_catalog.unnest(entry.input_types) WITH ORDINALITY arg(type_name, ordinal)
        ORDER BY arg.ordinal
      ) AS input_oids,
      ('pg_catalog.' || entry.result_type)::regtype::oid AS result_oid
      FROM pg_catalog.jsonb_to_recordset(${JSON.stringify(functions)}::text::jsonb) AS entry(
        routine name, owner_name name, input_types text[], result_type text,
        argument_names text[], body_hash text, setting_hashes text[]
      )
    ), dedicated_roles AS MATERIALIZED (
      SELECT r.oid, r.rolname, r.rolcanlogin, r.rolinherit, r.rolbypassrls, r.rolsuper,
        r.rolcreaterole, r.rolcreatedb, r.rolreplication
      FROM pg_catalog.pg_roles r
      WHERE r.rolname IN (SELECT owner_name FROM expected)
    ), identities AS MATERIALIZED (
      SELECT 'pg_catalog.pg_proc'::regclass::oid AS class_oid, p.oid AS object_oid,
        p.proowner AS owner_oid, r.oid AS expected_owner_oid,
        p.prokind = 'f' AND p.prorettype = e.result_oid AND NOT p.proretset
          AND p.prolang = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
          AND p.prosecdef AND p.provolatile = 'v' AND p.proparallel = 'u'
          AND NOT p.proisstrict AND NOT p.proleakproof AND p.procost = 100 AND p.prorows = 0
          AND p.prosupport = 0::oid AND p.provariadic = 0::oid AND p.pronargdefaults = 0
          AND p.proargdefaults IS NULL AND p.proallargtypes IS NULL AND p.proargmodes IS NULL
          AND p.protrftypes IS NULL AND p.probin IS NULL AND p.prosqlbody IS NULL
          AND (p.proargnames IS NOT DISTINCT FROM e.argument_names)
          AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc, 'UTF8')), 'hex')
            = e.body_hash
          AND ARRAY(
            SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(setting, 'UTF8')), 'hex')
              COLLATE "C"
            FROM pg_catalog.unnest(p.proconfig) AS settings(setting) ORDER BY 1
          ) = e.setting_hashes AS definition_ok
      FROM public_schema s JOIN pg_catalog.pg_proc p ON p.pronamespace = s.oid
      JOIN expected e ON p.proname = e.routine
        AND p.pronargs = pg_catalog.cardinality(e.input_oids)
        AND ARRAY(SELECT pg_catalog.unnest(p.proargtypes::oid[])) = e.input_oids
      LEFT JOIN dedicated_roles r ON r.rolname = e.owner_name
    ), matching_owners AS MATERIALIZED (
      SELECT class_oid, object_oid, owner_oid, definition_ok
      FROM identities WHERE owner_oid = expected_owner_oid
    ), observed_dependencies AS MATERIALIZED (
      SELECT d.dbid, d.classid, d.objid, d.objsubid, d.refobjid
      FROM pg_catalog.pg_shdepend d JOIN dedicated_roles r ON r.oid = d.refobjid
      WHERE d.refclassid = 'pg_catalog.pg_authid'::regclass AND d.deptype = 'o'
    ), expected_dependencies AS MATERIALIZED (
      -- Match dependencies to the observed identities before binding their count to the ledger.
      SELECT db.oid, a.class_oid, a.object_oid, 0, a.owner_oid
      FROM matching_owners a CROSS JOIN pg_catalog.pg_database db
      WHERE db.datname = pg_catalog.current_database()
    ), role_checks AS (
      SELECT r.rolcanlogin OR r.rolinherit OR r.rolbypassrls OR r.rolsuper OR r.rolcreaterole
        OR r.rolcreatedb OR r.rolreplication
        OR pg_catalog.has_schema_privilege(r.oid, s.oid, 'CREATE') IS NOT FALSE
        OR EXISTS (SELECT FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid)
        OR EXISTS (
          SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid = r.oid
          GROUP BY m.roleid
          HAVING count(*) <> 1 OR bool_and(
            m.member = migration.oid AND m.grantor = 10::oid
              AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
          ) IS NOT TRUE
        ) AS rejected
      FROM dedicated_roles r CROSS JOIN public_schema s CROSS JOIN migration_role migration
    )
    SELECT base.pid, base.public_count, base.owner_ok, base.acl_ok, base.foreign_nonroutine_count,
      base.foreign_routine_count - (
        SELECT count(*)::int FROM matching_owners a
        JOIN pg_catalog.pg_proc p ON a.class_oid = 'pg_catalog.pg_proc'::regclass
          AND a.object_oid = p.oid
        CROSS JOIN migration_role m WHERE p.proowner <> m.oid
      ) AS foreign_routine_count,
      base.collision_count,
      (SELECT count(*)::int FROM identities) AS identity_count,
      EXISTS (SELECT FROM identities WHERE owner_oid IS DISTINCT FROM expected_owner_oid)
        OR EXISTS (SELECT * FROM observed_dependencies EXCEPT ALL SELECT * FROM expected_dependencies)
        OR EXISTS (SELECT * FROM expected_dependencies EXCEPT ALL SELECT * FROM observed_dependencies)
        AS ownership_rejected,
      EXISTS (SELECT FROM role_checks WHERE rejected IS NOT FALSE) AS role_rejected,
      EXISTS (SELECT FROM matching_owners WHERE definition_ok IS NOT TRUE) AS definition_rejected
    FROM (${queryPublicSchema(sql)}) AS base
  `.catch(() => {
    throw new MigrationExecutionFault(publicSchemaRejected);
  });
  const row = requirePublicSchema(rows, expectedPid);
  const { identity_count: count } = row;
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > functions.length ||
    typeof row.ownership_rejected !== 'boolean' ||
    typeof row.role_rejected !== 'boolean' ||
    typeof row.definition_rejected !== 'boolean'
  )
    throw new MigrationExecutionFault(publicSchemaRejected);
  if (
    row.foreign_nonroutine_count !== 0 ||
    row.foreign_routine_count !== 0 ||
    row.ownership_rejected
  )
    throw new Error('PUBLIC_FOREIGN_OWNER_UNADMITTED');
  if (row.role_rejected) throw new Error('PUBLIC_FOREIGN_OWNER_ROLE_POSTURE');
  if (row.definition_rejected) throw new Error('PUBLIC_FOREIGN_OWNER_DEFINITION_MISMATCH');
  return count;
}
