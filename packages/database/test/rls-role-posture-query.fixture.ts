import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import postgres from 'postgres';
import { RLS_ROLE_POSTURE_REJECTED_SQLSTATE } from '../src/rls-role-posture-query';
export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export const quoteSqlLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

// Creates SUPERUSER/BYPASSRLS fixture roles, so it only ever targets a loopback database.
const databaseUrl = resolveLoopbackDatabaseUrl(process.env.DATABASE_URL);
const requireIntegration = process.env.REQUIRE_RLS_INTEGRATION === '1';
export const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
const password = randomUUID();
export const roles = {
  safe: `ida_posture_safe_${suffix}`,
  bypass: `ida_posture_bypass_${suffix}`,
  superuser: `ida_posture_super_${suffix}`,
} as const;
export const hijackSchema = `ida_posture_hijack_${suffix}`;

// A replaced shared boolean parser: every bool column decodes as false.
const corruptedBoolParser = {
  bool: {
    to: 16,
    from: [16],
    serialize: (value: unknown) => (value ? 't' : 'f'),
    parse: () => false,
  },
};

function resolveLoopbackDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const { hostname } = new URL(value);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) ? value : undefined;
  } catch {
    return undefined;
  }
}

type ClientOptions = {
  corruptBool?: boolean;
  searchPath?: string;
  setRole?: string;
};

function connectAs(role: string, options: ClientOptions = {}): postgres.Sql {
  const url = new URL(databaseUrl!);
  url.username = role;
  url.password = password;
  return postgres(url.toString(), {
    max: 1,
    onnotice: () => undefined,
    ...(options.corruptBool ? { types: corruptedBoolParser } : {}),
    connection: {
      ...(options.searchPath ? { search_path: options.searchPath } : {}),
      ...(options.setRole ? { options: `-c role=${options.setRole}` } : {}),
    },
  });
}

export async function withClient<T>(
  role: string,
  options: ClientOptions,
  run: (client: postgres.Sql) => Promise<T>
): Promise<T> {
  const client = connectAs(role, options);
  try {
    return await run(client);
  } finally {
    await client.end({ timeout: 5 });
  }
}

export function assertServerRejected(error: unknown): true {
  assert.equal((error as { code?: unknown }).code, RLS_ROLE_POSTURE_REJECTED_SQLSTATE);
  return true;
}

export let admin: postgres.Sql | undefined;
let unavailableReason: string | undefined = databaseUrl
  ? undefined
  : 'A loopback DATABASE_URL is not configured';

export function requireDatabase(t: TestContext): boolean {
  if (!unavailableReason) return true;
  if (requireIntegration) assert.fail(`RLS role posture proof required: ${unavailableReason}`);
  t.skip(unavailableReason);
  return false;
}

test.before(async () => {
  if (!databaseUrl) return;
  admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await admin`select 1`;
  } catch (error) {
    await admin.end({ timeout: 1 });
    admin = undefined;
    unavailableReason = `loopback database unreachable: ${(error as Error).message}`;
    return;
  }
  const pw = quoteSqlLiteral(password);
  await admin.unsafe(`
    create role ${quoteIdentifier(roles.safe)} login nosuperuser nobypassrls password ${pw};
    create role ${quoteIdentifier(roles.bypass)} login nosuperuser bypassrls password ${pw};
    create role ${quoteIdentifier(roles.superuser)} login superuser password ${pw};
    create schema ${quoteIdentifier(hijackSchema)};
    create view ${quoteIdentifier(hijackSchema)}.pg_roles as
      select rolname, false as rolbypassrls, false as rolsuper from pg_catalog.pg_roles;
    create function ${quoteIdentifier(hijackSchema)}.always_one(integer, integer)
      returns integer language sql immutable as 'select 1';
    create operator ${quoteIdentifier(hijackSchema)}./ (
      leftarg = integer, rightarg = integer,
      function = ${quoteIdentifier(hijackSchema)}.always_one
    );
    grant usage on schema ${quoteIdentifier(hijackSchema)} to public;
    grant select on ${quoteIdentifier(hijackSchema)}.pg_roles to public;
  `);
});

test.after(async () => {
  if (!admin) return;
  await admin.unsafe(`
    drop schema if exists ${quoteIdentifier(hijackSchema)} cascade;
    drop role if exists ${quoteIdentifier(roles.safe)};
    drop role if exists ${quoteIdentifier(roles.bypass)};
    drop role if exists ${quoteIdentifier(roles.superuser)};
  `);
  await admin.end({ timeout: 5 });
});
