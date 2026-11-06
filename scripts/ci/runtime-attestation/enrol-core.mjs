// U2-e staging enrolment, operation ida.u2e.staging-enrol.v1 (owner-approved 2026-11-06, staging
// only). Outside every migration journal and ledger: it provisions the backend marker the runtime
// observation reads and grants the restricted runtime role read access to the migration ledger.
// One admin transaction under an advisory lock; preconditions refuse, never repair; postconditions
// prove the exact privilege matrix before commit. No error text, URL or option leaves this module.

import { createHash } from 'node:crypto';

export const ENROL_OPERATION = 'ida.u2e.staging-enrol.v1';
export const MARKER_PATTERN =
  /^ida\.staging\.backend-marker\.v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ROLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;
const API_ROLES = ['anon', 'authenticated', 'service_role'];
const LEDGER_COLUMNS = 'created_at,hash,id';
const BOUNDS = [
  'SET LOCAL statement_timeout = 5000',
  'SET LOCAL lock_timeout = 3000',
  'SET LOCAL idle_in_transaction_session_timeout = 10000',
  'SET LOCAL search_path = pg_catalog, pg_temp',
];
const ADVISORY_LOCK =
  "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('" + ENROL_OPERATION + "'))";

export class EnrolError extends Error {
  constructor(code) {
    super(code);
    this.name = 'EnrolError';
    this.code = code;
  }
}

const refuse = code => {
  throw new EnrolError(code);
};
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function assertEnrolInputs({ role, marker }) {
  if (typeof role !== 'string' || !ROLE_PATTERN.test(role)) refuse('ROLE_NAME_INVALID');
  if (typeof marker !== 'string' || !MARKER_PATTERN.test(marker)) refuse('MARKER_INVALID');
}

async function rolePosture(tx, role) {
  const rows = await tx`
    SELECT r.rolcanlogin AS login, r.rolsuper AS super, r.rolbypassrls AS bypassrls,
      r.rolcreatedb AS createdb, r.rolcreaterole AS createrole, r.rolreplication AS replication,
      (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid)::int AS memberships,
      ((SELECT count(*) FROM pg_catalog.pg_class WHERE relowner = r.oid)
        + (SELECT count(*) FROM pg_catalog.pg_namespace WHERE nspowner = r.oid)
        + (SELECT count(*) FROM pg_catalog.pg_proc WHERE proowner = r.oid)
        + (SELECT count(*) FROM pg_catalog.pg_database WHERE datdba = r.oid))::int AS owned,
      pg_catalog.has_database_privilege(r.oid, pg_catalog.current_database(), 'CREATE') AS "dbCreate"
    FROM pg_catalog.pg_roles r WHERE r.rolname = ${role}`;
  const posture = rows[0] ?? refuse('ROLE_MISSING');
  if (!posture.login) refuse('ROLE_NOT_LOGIN');
  for (const flag of ['super', 'bypassrls', 'createdb', 'createrole', 'replication'])
    if (posture[flag] !== false) refuse('ROLE_PRIVILEGED');
  if (posture.memberships !== 0) refuse('ROLE_HAS_MEMBERSHIPS');
  if (posture.owned !== 0) refuse('ROLE_OWNS_OBJECTS');
  if (posture.dbCreate !== false) refuse('ROLE_CAN_CREATE_SCHEMA');
  return posture;
}

async function ledgerShape(tx) {
  const shape = await tx`
    SELECT c.relkind::text AS kind,
      (SELECT pg_catalog.string_agg(a.attname::text, ',' ORDER BY a.attname) FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'drizzle' AND c.relname = '__drizzle_migrations'`;
  if (shape.length !== 1) refuse('LEDGER_MISSING');
  if (shape[0].kind !== 'r' || shape[0].columns !== LEDGER_COLUMNS) refuse('LEDGER_SHAPE_MISMATCH');
}

async function ledgerSnapshot(tx) {
  const rows = await tx.unsafe(
    'SELECT id::text AS id, hash::text AS hash, created_at::text AS "createdAt" FROM drizzle.__drizzle_migrations ORDER BY id'
  );
  return { count: rows.length, sha256: sha256(JSON.stringify(rows.map(row => ({ ...row })))) };
}

// An existing marker schema is accepted only in exactly the shape this operation creates.
async function existingMarkerShape(tx, marker) {
  const [shape] = await tx`
    WITH ns AS (SELECT oid, nspowner FROM pg_catalog.pg_namespace WHERE nspname = 'runtime_attestation'),
      tbl AS (SELECT c.oid, c.relowner FROM pg_catalog.pg_class c, ns
        WHERE c.relnamespace = ns.oid AND c.relname = 'backend_marker' AND c.relkind = 'r')
    SELECT (SELECT nspowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user) FROM ns) AS "schemaOwned",
      (SELECT relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user) FROM tbl) AS "tableOwned",
      (SELECT pg_catalog.string_agg(c.relname || ':' || c.relkind::text, ',' ORDER BY c.relname) FROM pg_catalog.pg_class c, ns
        WHERE c.relnamespace = ns.oid) AS relations,
      (SELECT count(*) FROM pg_catalog.pg_proc p, ns WHERE p.pronamespace = ns.oid)::int AS functions,
      (SELECT count(*) FROM pg_catalog.pg_type t, ns, tbl WHERE t.typnamespace = ns.oid AND t.typrelid <> tbl.oid
        AND t.typelem NOT IN (SELECT oid FROM pg_catalog.pg_type WHERE typrelid = tbl.oid))::int AS types,
      (SELECT count(*) FROM pg_catalog.pg_trigger g, tbl WHERE g.tgrelid = tbl.oid)::int AS triggers,
      (SELECT count(*) FROM pg_catalog.pg_rewrite w, tbl WHERE w.ev_class = tbl.oid)::int AS rules,
      (SELECT count(*) FROM pg_catalog.pg_policy p, tbl WHERE p.polrelid = tbl.oid)::int AS policies,
      (SELECT pg_catalog.string_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod), ',')
        FROM pg_catalog.pg_attribute a, tbl WHERE a.attrelid = tbl.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
      (SELECT pg_catalog.string_agg(k.contype::text || ':' || pg_catalog.pg_get_constraintdef(k.oid), '|' ORDER BY k.contype)
        FROM pg_catalog.pg_constraint k, tbl WHERE k.conrelid = tbl.oid) AS constraints`;
  const check = `c:CHECK ((marker = '${marker}'::text))|p:PRIMARY KEY (marker)`;
  const exact =
    shape.schemaOwned === true &&
    shape.tableOwned === true &&
    shape.relations === 'backend_marker:r,backend_marker_pkey:i' &&
    shape.functions === 0 &&
    shape.types === 0 &&
    shape.triggers === 0 &&
    shape.rules === 0 &&
    shape.policies === 0 &&
    shape.columns === 'marker:text' &&
    shape.constraints === check;
  if (!exact) refuse('MARKER_SHAPE_MISMATCH');
  const rows = await tx.unsafe(
    'SELECT marker::text AS marker FROM runtime_attestation.backend_marker'
  );
  if (rows.length === 0) refuse('MARKER_EMPTY');
  if (rows.length !== 1 || rows[0].marker !== marker) refuse('MARKER_MISMATCH');
}

async function createMarker(tx, role, marker) {
  await tx.unsafe('CREATE SCHEMA runtime_attestation');
  // The literal is safe: `marker` matched MARKER_PATTERN ([a-z0-9.:-] only) before this point.
  await tx.unsafe(
    `CREATE TABLE runtime_attestation.backend_marker (marker text PRIMARY KEY CHECK (marker = '${marker}'))`
  );
  await tx`INSERT INTO runtime_attestation.backend_marker (marker) VALUES (${marker})`;
  await tx.unsafe('REVOKE ALL ON SCHEMA runtime_attestation FROM PUBLIC');
  await tx.unsafe('REVOKE ALL ON TABLE runtime_attestation.backend_marker FROM PUBLIC');
  const present =
    await tx`SELECT rolname::text AS name FROM pg_catalog.pg_roles WHERE rolname IN ${tx(API_ROLES)}`;
  for (const grantee of [...present.map(row => row.name), role]) {
    await tx`REVOKE ALL ON SCHEMA runtime_attestation FROM ${tx(grantee)}`;
    await tx`REVOKE ALL ON TABLE runtime_attestation.backend_marker FROM ${tx(grantee)}`;
  }
  await tx`GRANT USAGE ON SCHEMA runtime_attestation TO ${tx(role)}`;
  await tx`GRANT SELECT ON TABLE runtime_attestation.backend_marker TO ${tx(role)}`;
}

/** Grants other than the owner's on the marker objects; nothing but the two reads may exist. */
async function markerAcl(tx) {
  const [acl] = await tx`
    WITH ns AS (SELECT oid, nspowner, nspacl FROM pg_catalog.pg_namespace WHERE nspname = 'runtime_attestation'),
      tbl AS (SELECT c.oid, c.relowner, c.relacl FROM pg_catalog.pg_class c, ns
        WHERE c.relnamespace = ns.oid AND c.relname = 'backend_marker')
    SELECT
      (SELECT pg_catalog.string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END
        || ':' || a.privilege_type || ':' || a.is_grantable, ',')
        FROM ns, pg_catalog.aclexplode(ns.nspacl) a WHERE a.grantee <> ns.nspowner) AS schema,
      (SELECT pg_catalog.string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END
        || ':' || a.privilege_type || ':' || a.is_grantable, ',')
        FROM tbl, pg_catalog.aclexplode(tbl.relacl) a WHERE a.grantee <> tbl.relowner) AS "table",
      (SELECT count(*) FROM pg_catalog.pg_attribute x, tbl WHERE x.attrelid = tbl.oid AND x.attacl IS NOT NULL)::int
        AS "columnAcls"`;
  return acl;
}

async function privilegeMatrix(tx, role) {
  const [m] = await tx`
    WITH r AS (SELECT ${role}::pg_catalog.name AS n),
      l AS (SELECT 'drizzle.__drizzle_migrations'::pg_catalog.regclass AS oid),
      k AS (SELECT 'runtime_attestation.backend_marker'::pg_catalog.regclass AS oid)
    SELECT
      pg_catalog.has_schema_privilege(r.n, 'drizzle', 'USAGE') AS "ledgerSchemaUsage",
      pg_catalog.has_schema_privilege(r.n, 'drizzle', 'CREATE') AS "ledgerSchemaCreate",
      pg_catalog.has_table_privilege(r.n, l.oid, 'SELECT') AS "ledgerSelect",
      pg_catalog.has_table_privilege(r.n, l.oid, 'SELECT WITH GRANT OPTION') AS "ledgerGrantOption",
      pg_catalog.has_table_privilege(r.n, l.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS "ledgerWrite",
      pg_catalog.has_any_column_privilege(r.n, l.oid, 'INSERT,UPDATE,REFERENCES') AS "ledgerColumnWrite",
      pg_catalog.has_schema_privilege(r.n, 'runtime_attestation', 'USAGE') AS "markerSchemaUsage",
      pg_catalog.has_schema_privilege(r.n, 'runtime_attestation', 'CREATE') AS "markerSchemaCreate",
      pg_catalog.has_table_privilege(r.n, k.oid, 'SELECT') AS "markerSelect",
      pg_catalog.has_table_privilege(r.n, k.oid, 'SELECT WITH GRANT OPTION') AS "markerGrantOption",
      pg_catalog.has_table_privilege(r.n, k.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS "markerWrite",
      pg_catalog.has_any_column_privilege(r.n, k.oid, 'INSERT,UPDATE,REFERENCES') AS "markerColumnWrite",
      (SELECT count(*) FROM pg_catalog.pg_class c WHERE c.relnamespace = 'drizzle'::pg_catalog.regnamespace
        AND CASE WHEN c.relkind = 'S' THEN pg_catalog.has_sequence_privilege(r.n, c.oid, 'USAGE,SELECT,UPDATE')
          ELSE false END)::int
        AS "sequenceAccess",
      (SELECT count(*) FROM pg_catalog.pg_class c WHERE c.relnamespace = 'drizzle'::pg_catalog.regnamespace
        AND c.oid <> l.oid
        AND CASE WHEN c.relkind IN ('r', 'v', 'm', 'f', 'p')
          THEN pg_catalog.has_table_privilege(r.n, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR pg_catalog.has_any_column_privilege(r.n, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
          ELSE false END)::int
        AS "otherRelationAccess",
      (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.pronamespace = 'drizzle'::pg_catalog.regnamespace
        AND pg_catalog.has_function_privilege(r.n, p.oid, 'EXECUTE'))::int AS "functionAccess"
    FROM r, l, k`;
  return m;
}

/** The only privileges the runtime role may hold on the enrolled objects and the ledger schema. */
export const EXPECTED_MATRIX = Object.freeze({
  ledgerSchemaUsage: true,
  ledgerSchemaCreate: false,
  ledgerSelect: true,
  ledgerGrantOption: false,
  ledgerWrite: false,
  ledgerColumnWrite: false,
  markerSchemaUsage: true,
  markerSchemaCreate: false,
  markerSelect: true,
  markerGrantOption: false,
  markerWrite: false,
  markerColumnWrite: false,
  sequenceAccess: 0,
  otherRelationAccess: 0,
  functionAccess: 0,
});

async function postconditions(tx, role, before) {
  const acl = await markerAcl(tx);
  const grant = privilege => `${role}:${privilege}:false`;
  if (acl.schema !== grant('USAGE') || acl.table !== grant('SELECT') || acl.columnAcls !== 0)
    refuse('MARKER_ACL_UNEXPECTED');
  const matrix = await privilegeMatrix(tx, role);
  for (const [key, expected] of Object.entries(EXPECTED_MATRIX))
    if (matrix[key] !== expected) refuse('PRIVILEGE_MATRIX_UNEXPECTED');
  const after = await ledgerSnapshot(tx);
  if (after.count !== before.count || after.sha256 !== before.sha256) refuse('LEDGER_CHANGED');
  await rolePosture(tx, role);
  return matrix;
}

/**
 * Runs the enrolment on a reserved admin client. The outcome separates a refusal or failure that
 * rolled back (`not_committed`) from a lost commit acknowledgement (`commit_unknown`).
 */
export async function enrolStaging(admin, { role, marker }) {
  let bodyDone = false;
  try {
    assertEnrolInputs({ role, marker });
    const result = await admin.begin(async tx => {
      for (const bound of BOUNDS) await tx.unsafe(bound);
      await tx.unsafe(ADVISORY_LOCK);
      await rolePosture(tx, role);
      const [{ present }] = await tx`
        SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'runtime_attestation') AS present`;
      await ledgerShape(tx);
      // Excludes concurrent ledger writes (a migration run) until commit; bounded by lock_timeout.
      await tx.unsafe('LOCK TABLE drizzle.__drizzle_migrations IN SHARE MODE');
      const before = await ledgerSnapshot(tx);
      if (present) await existingMarkerShape(tx, marker);
      else await createMarker(tx, role, marker);
      await tx`GRANT USAGE ON SCHEMA drizzle TO ${tx(role)}`;
      await tx`GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO ${tx(role)}`;
      const privileges = await postconditions(tx, role, before);
      bodyDone = true;
      return { path: present ? 'verified' : 'created', privileges, ledger: before };
    });
    return { transaction: 'committed', code: null, markerSha256: sha256(marker), ...result };
  } catch (error) {
    if (bodyDone) return { transaction: 'commit_unknown', code: 'COMMIT_UNACKNOWLEDGED' };
    const code = error instanceof EnrolError ? error.code : 'DATABASE_ERROR';
    return { transaction: 'not_committed', code };
  }
}

/** The restricted login's own read-only view: identity, the one marker, the observer's ledger read. */
export async function readBack(restricted, { role, marker }) {
  try {
    return await restricted.begin('read only', async tx => {
      for (const bound of BOUNDS) await tx.unsafe(bound);
      const [id] =
        await tx`SELECT session_user::text AS "session", current_user::text AS "current"`;
      if (id.session !== role || id.current !== role) refuse('READBACK_IDENTITY_MISMATCH');
      const markers = await tx.unsafe(
        'SELECT marker::text AS marker FROM runtime_attestation.backend_marker'
      );
      if (markers.length !== 1 || markers[0].marker !== marker) refuse('READBACK_MARKER_MISMATCH');
      const ledger = await tx.unsafe(
        'SELECT hash::text AS hash, created_at::text AS "createdAt" FROM drizzle.__drizzle_migrations ORDER BY id'
      );
      const rows = ledger.map(row => ({ hash: row.hash, createdAt: row.createdAt }));
      return {
        readback: 'ok',
        code: null,
        ledgerCount: rows.length,
        ledgerSha256: sha256(JSON.stringify(rows)),
      };
    });
  } catch (error) {
    return {
      readback: 'failed',
      code: error instanceof EnrolError ? error.code : 'READBACK_DATABASE_ERROR',
    };
  }
}
