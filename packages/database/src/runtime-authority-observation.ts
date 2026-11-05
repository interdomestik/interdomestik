// U2-e: a secret-free observation of the authority the connection it runs on actually holds.
// Every statement is static, read-only and catalogue-only; the caller runs them in one read-only
// transaction on the deployed tenant client. No identifier, URL or SQL comes from a request.
// Evaluation against the reviewed expectation happens in CD (scripts/ci/runtime-attestation).

import { sql } from 'drizzle-orm';

import { assertRlsConnectionRoleReady, dbRls } from './db';

export type RuntimeAuthorityQuery = (text: string) => Promise<readonly Record<string, unknown>[]>;

export type ObservedRole = {
  name: string;
  rolcanlogin: boolean;
  rolinherit: boolean;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
};

export type RuntimeAuthorityObservation = {
  sessionUser: string;
  currentUser: string;
  serverVersionNum: number;
  login: ObservedRole | null;
  reachableRoles: ObservedRole[];
  memberships: { member: string; role: string; adminOption: boolean }[];
  ownedObjectCount: number;
  databasePrivileges: string[];
  roleSettings: string[];
  effectiveSettings: string[];
  backendMarker: string | null;
  migrationLedger: { hash: string; createdAt: number }[] | null;
};

/** Where an enrolled backend marker is read from, once a reviewed migration provisions it. */
const MARKER_SCHEMA = 'runtime_attestation';
const MARKER_TABLE = 'backend_marker';
export const BACKEND_MARKER_RELATION = `${MARKER_SCHEMA}.${MARKER_TABLE}`;
const LEDGER_SCHEMA = 'drizzle';
const LEDGER_TABLE = '__drizzle_migrations';
const LEDGER_RELATION = `${LEDGER_SCHEMA}.${LEDGER_TABLE}`;

// Database-side bounds: every statement, lock wait and idle gap is capped, and no statement starts
// after the deadline, so the transaction ends (and rolls back) by itself well before the HTTP layer
// stops waiting: at most OBSERVATION_DEADLINE_MS plus one statement timeout.
export const OBSERVATION_STATEMENT_TIMEOUT_MS = 1000;
export const OBSERVATION_DEADLINE_MS = 6000;
const BOUNDS = [
  `SET LOCAL statement_timeout = ${OBSERVATION_STATEMENT_TIMEOUT_MS}`,
  'SET LOCAL lock_timeout = 500',
  'SET LOCAL idle_in_transaction_session_timeout = 2000',
] as const;

const ROLE_COLUMNS = `rolname::text AS name, rolcanlogin, rolinherit, rolsuper, rolbypassrls,
  rolcreatedb, rolcreaterole, rolreplication`;

// Roles reachable from the session LOGIN through any membership edge, whatever its options.
const REACH = `WITH RECURSIVE reach(oid) AS (
    SELECT oid FROM pg_roles WHERE rolname = session_user
    UNION
    SELECT m.roleid FROM pg_auth_members m JOIN reach r ON m.member = r.oid
  )`;

const STATEMENTS = {
  identity: `SELECT session_user::text AS "sessionUser", current_user::text AS "currentUser",
    current_setting('server_version_num')::int AS "serverVersionNum"`,
  login: `SELECT ${ROLE_COLUMNS} FROM pg_roles WHERE rolname = session_user`,
  memberships: `${REACH}
    SELECT mr.rolname::text AS member, rr.rolname::text AS role, m.admin_option AS "adminOption"
    FROM pg_auth_members m JOIN reach r ON m.member = r.oid
    JOIN pg_roles mr ON mr.oid = m.member JOIN pg_roles rr ON rr.oid = m.roleid
    ORDER BY 1, 2`,
  reachableRoles: `${REACH}
    SELECT ${ROLE_COLUMNS} FROM pg_roles
    WHERE oid IN (SELECT oid FROM reach) AND rolname <> session_user ORDER BY 1`,
  owned: `${REACH}
    SELECT ((SELECT count(*) FROM pg_class WHERE relowner IN (SELECT oid FROM reach))
      + (SELECT count(*) FROM pg_proc WHERE proowner IN (SELECT oid FROM reach))
      + (SELECT count(*) FROM pg_namespace WHERE nspowner IN (SELECT oid FROM reach))
      + (SELECT count(*) FROM pg_database WHERE datdba IN (SELECT oid FROM reach)))::int AS owned`,
  databasePrivileges: `SELECT p AS privilege FROM unnest(ARRAY['CREATE', 'CONNECT', 'TEMPORARY']) p
    WHERE has_database_privilege(session_user, current_database(), p) ORDER BY 1`,
  // Role-wide, database-wide and role-in-database defaults that apply to this session.
  roleSettings: `SELECT unnest(s.setconfig)::text AS setting FROM pg_db_role_setting s
    WHERE s.setrole IN (0, (SELECT oid FROM pg_roles WHERE rolname = session_user))
      AND s.setdatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
    ORDER BY 1`,
  // Effective non-default boolean and enum settings of this session, whatever their source
  // (configuration file, database, role or an earlier session on a pooled connection).
  effectiveSettings: `SELECT name || '=' || setting AS setting FROM pg_settings
    WHERE source <> 'default' AND vartype IN ('bool', 'enum') ORDER BY name`,
  // Relations are found by catalogue OID and checked by OID, so a schema without USAGE reads as
  // unavailable instead of raising inside the read-only transaction.
  readable: `WITH rel(kind, oid, nsp) AS (
      SELECT 'marker', c.oid, c.relnamespace
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${MARKER_SCHEMA}' AND c.relname = '${MARKER_TABLE}'
      UNION ALL
      SELECT 'ledger', c.oid, c.relnamespace
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${LEDGER_SCHEMA}' AND c.relname = '${LEDGER_TABLE}'
    )
    SELECT
      coalesce(bool_or(kind = 'marker' AND has_schema_privilege(session_user, nsp, 'USAGE')
        AND has_table_privilege(session_user, oid, 'SELECT')), false) AS marker,
      coalesce(bool_or(kind = 'ledger' AND has_schema_privilege(session_user, nsp, 'USAGE')
        AND has_table_privilege(session_user, oid, 'SELECT')), false) AS ledger
    FROM rel`,
  marker: `SELECT marker::text AS marker FROM ${BACKEND_MARKER_RELATION}`,
  ledger: `SELECT hash::text AS hash, created_at::text AS "createdAt"
    FROM ${LEDGER_RELATION} ORDER BY id`,
} as const;

export class RuntimeAuthorityObservationError extends Error {
  constructor(readonly code: 'MALFORMED_CATALOGUE_ROW' | 'DEADLINE_EXCEEDED') {
    super(code);
    this.name = 'RuntimeAuthorityObservationError';
  }
}

function malformed(): never {
  throw new RuntimeAuthorityObservationError('MALFORMED_CATALOGUE_ROW');
}

const text = (value: unknown): string => (typeof value === 'string' ? value : malformed());
const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : malformed());

function role(row: Record<string, unknown>): ObservedRole {
  return {
    name: text(row.name),
    rolcanlogin: flag(row.rolcanlogin),
    rolinherit: flag(row.rolinherit),
    rolsuper: flag(row.rolsuper),
    rolbypassrls: flag(row.rolbypassrls),
    rolcreatedb: flag(row.rolcreatedb),
    rolcreaterole: flag(row.rolcreaterole),
    rolreplication: flag(row.rolreplication),
  };
}

function ledgerRow(row: Record<string, unknown>): { hash: string; createdAt: number } {
  const createdAt = Number(text(row.createdAt));
  if (!Number.isSafeInteger(createdAt)) malformed();
  return { hash: text(row.hash), createdAt };
}

/** The marker: exactly one row, or null when absent or ambiguous. */
async function readMarker(query: RuntimeAuthorityQuery): Promise<string | null> {
  const rows = await query(STATEMENTS.marker);
  return rows.length === 1 ? text(rows[0].marker) : null;
}

async function readLedger(
  query: RuntimeAuthorityQuery
): Promise<{ hash: string; createdAt: number }[]> {
  return (await query(STATEMENTS.ledger)).map(ledgerRow);
}

/**
 * Applies the bounds, then runs the fixed catalogue statements in order; any failure propagates to
 * the caller, whose transaction then rolls back. No statement starts after `deadline` (epoch ms).
 */
export async function observeRuntimeAuthority(
  run: RuntimeAuthorityQuery,
  {
    deadline = Number.POSITIVE_INFINITY,
    now = Date.now,
  }: { deadline?: number; now?: () => number } = {}
): Promise<RuntimeAuthorityObservation> {
  const query: RuntimeAuthorityQuery = async statement => {
    if (now() > deadline) throw new RuntimeAuthorityObservationError('DEADLINE_EXCEEDED');
    return run(statement);
  };
  // The bounds apply in order on the one transaction connection before any catalogue read.
  await BOUNDS.reduce<Promise<unknown>>(
    (applied, bound) => applied.then(() => query(bound)),
    Promise.resolve()
  );
  const [identity] = await query(STATEMENTS.identity);
  if (!identity) malformed();
  const [login] = await query(STATEMENTS.login);
  const memberships = (await query(STATEMENTS.memberships)).map(row => ({
    member: text(row.member),
    role: text(row.role),
    adminOption: flag(row.adminOption),
  }));
  const reachableRoles = (await query(STATEMENTS.reachableRoles)).map(role);
  const [owned] = await query(STATEMENTS.owned);
  const databasePrivileges = (await query(STATEMENTS.databasePrivileges)).map(row =>
    text(row.privilege)
  );
  const roleSettings = (await query(STATEMENTS.roleSettings)).map(row => text(row.setting));
  const effectiveSettings = (await query(STATEMENTS.effectiveSettings)).map(row =>
    text(row.setting)
  );
  const [readable] = await query(STATEMENTS.readable);
  const serverVersionNum = Number(identity.serverVersionNum);
  const ownedObjectCount = Number(owned?.owned);
  if (!Number.isSafeInteger(serverVersionNum) || !Number.isSafeInteger(ownedObjectCount))
    malformed();
  return {
    sessionUser: text(identity.sessionUser),
    currentUser: text(identity.currentUser),
    serverVersionNum,
    login: login ? role(login) : null,
    reachableRoles,
    memberships,
    ownedObjectCount,
    databasePrivileges,
    roleSettings,
    effectiveSettings,
    backendMarker: flag(readable?.marker) ? await readMarker(query) : null,
    migrationLedger: flag(readable?.ledger) ? await readLedger(query) : null,
  };
}

/**
 * Observes the deployed tenant client itself (`dbRls`, never a client built here) in one read-only
 * transaction, before any role switch: tenant transactions apply DB_RLS_ROLE, this one does not.
 */
export async function observeTenantClientAuthority(): Promise<RuntimeAuthorityObservation> {
  const deadline = Date.now() + OBSERVATION_DEADLINE_MS;
  await assertRlsConnectionRoleReady();
  return dbRls.transaction(
    async tx =>
      observeRuntimeAuthority(
        async text => (await tx.execute(sql.raw(text))) as unknown as Record<string, unknown>[],
        { deadline }
      ),
    { isolationLevel: 'repeatable read', accessMode: 'read only' }
  );
}
