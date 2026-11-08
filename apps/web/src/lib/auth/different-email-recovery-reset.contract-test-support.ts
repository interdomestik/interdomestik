import * as schema from '@interdomestik/database/schema';
import { hash } from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { afterAll, afterEach, describe, expect, vi, type Mock } from 'vitest';

import { authRequestAuthority } from './auth-request-authority';
import * as store from './different-email-recovery-store';
import {
  cleanupRecoveryRows,
  createRecoveryOwner,
  recoverySql,
  stageReplacement,
} from './different-email-recovery-store.contract-test-support';
import { databaseHooks } from './hooks';
import { authProviders } from './providers';
import { userSchemaConfig } from './schema';

/**
 * ACQ-2c reset contract harness: the app's real reset configuration (`authProviders`, user schema,
 * request authority and database hooks, no session cookie cache, like `lib/auth/index.ts`) on a
 * real PostgreSQL adapter, with two pause points for interleavings: after Better Auth looked up the
 * user but before it stores the token, and after it consumed a token but before it writes the hash.
 */
export const PASSWORD = 'Original-Passw0rd!';
export const NEW_PASSWORD = 'Replaced-Passw0rd!';
export const gates: {
  beforeToken?: (identifier: string) => Promise<void>;
  beforeHash?: () => Promise<void>;
} = {};

const db = drizzle(recoverySql, { schema });
const resetUsers = new Set<string>();

export function resetAuth() {
  const { emailAndPassword } = authProviders;
  return betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'ida-acq2c-reset-contract-secret-at-least-32-bytes',
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    user: userSchemaConfig,
    hooks: { before: authRequestAuthority },
    plugins: authProviders.plugins,
    databaseHooks: {
      ...databaseHooks,
      verification: {
        create: {
          before: async row => {
            if (row.identifier.startsWith('reset-password:'))
              await gates.beforeToken?.(row.identifier);
          },
        },
      },
    },
    emailAndPassword: {
      ...emailAndPassword,
      password: {
        hash: async (password: string) => {
          await gates.beforeHash?.();
          return emailAndPassword.password.hash(password);
        },
        verify: emailAndPassword.password.verify,
      },
    },
    rateLimit: { enabled: false },
  });
}
type ResetAuth = ReturnType<typeof resetAuth>;

function post(auth: ResetAuth, path: string, body: Record<string, unknown>, query = '') {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth/${path}${query}`, {
      method: 'POST',
      headers: {
        host: 'ida.localhost:3000',
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  );
}

export function requestReset(auth: ResetAuth, email: string) {
  return post(auth, 'request-password-reset', { email, redirectTo: '/sq/reset-password' });
}

export function resetWith(auth: ResetAuth, token: string, newPassword = NEW_PASSWORD) {
  return post(auth, 'reset-password', { token, newPassword });
}

/** A reset whose token travels in the query; `bodyToken` adds a (blank) body token beside it. */
export function resetWithQuery(auth: ResetAuth, token: string, bodyToken?: string) {
  const body = bodyToken === undefined ? {} : { token: bodyToken };
  const query = `?token=${encodeURIComponent(token)}`;
  return post(auth, 'reset-password', { ...body, newPassword: NEW_PASSWORD }, query);
}

/** The session cookie of a fresh sign-in, or null when the credentials are refused. */
export async function signIn(auth: ResetAuth, email: string, password: string) {
  const response = await post(auth, 'sign-in/email', { email, password });
  if (!response.ok) return null;
  return response.headers
    .getSetCookie()
    .map(value => value.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

export async function sessionUser(auth: ResetAuth, cookie: string) {
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  return session?.user.id ?? null;
}

export function tokenFrom(url: string) {
  const token = /\/reset-password\/([^?/]+)\?/u.exec(url)?.[1];
  expect(token, url).toBeTruthy();
  return token!;
}

/** A recovery owner (see the store harness) with an existing credential password. */
export async function credentialOwner(label: string, withPassword = true) {
  const owner = await createRecoveryOwner(`acq2c-${label}`);
  resetUsers.add(owner.id);
  if (withPassword) {
    const digest = await hash(PASSWORD, 10);
    // prettier-ignore
    await recoverySql`insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt") values (${randomUUID()}, ${owner.id}, 'credential', ${owner.id}, ${digest}, now(), now())`;
  }
  return owner;
}

export async function resetRows(userId: string) {
  // prettier-ignore
  const rows = await recoverySql<{ identifier: string }[]>`select "identifier" from "verification" where "value" = ${userId} and "identifier" like 'reset-password:%'`;
  return rows.map(row => row.identifier);
}

/** The dual-proof email change of the store harness, completed; true when it committed. */
export async function changeEmail(userId: string, currentEmail: string, target: string) {
  const tag = randomUUID();
  await stageReplacement(userId, currentEmail, target, tag);
  const { ok } = await store.confirmReplacementProof(userId, () => `${tag}-r`, new Date(0));
  return ok;
}

const TRAPS = {
  session: { table: 'session', event: 'delete', owned: (id: string) => `old."userId" = '${id}'` },
  'reset-token': {
    table: 'verification',
    event: 'delete',
    owned: (id: string) => `old."value" = '${id}' and old."identifier" like 'reset-password:%'`,
  },
  'user-update': { table: 'user', event: 'update', owned: (id: string) => `old."id" = '${id}'` },
} as const;

/** Runs `body` while the given write on rows owned by `userId` raises, then removes the trap. */
export async function withWriteFailure<T>(
  trap: keyof typeof TRAPS,
  userId: string,
  body: () => Promise<T>
): Promise<T> {
  expect(userId).toMatch(/^[0-9a-f-]{36}$/u);
  const { table, event, owned } = TRAPS[trap];
  const name = `ida_acq2c_block_${table}`;
  const kept = event === 'delete' ? 'old' : 'new';
  await recoverySql.unsafe(
    `create or replace function ${name}() returns trigger language plpgsql as $$ begin ` +
      `if ${owned(userId)} then raise exception 'ACQ2C_FORCED_WRITE_FAILURE'; end if; ` +
      `return ${kept}; end $$; drop trigger if exists ${name} on "${table}"; ` +
      `create trigger ${name} before ${event} on "${table}" for each row execute function ${name}();`
  );
  try {
    return await body();
  } finally {
    await recoverySql.unsafe(
      `drop trigger if exists ${name} on "${table}"; drop function ${name}();`
    );
  }
}

/** Every line the console received, rendered with error messages, causes and stacks. */
export function captureConsole() {
  const lines: string[] = [];
  for (const method of ['error', 'warn', 'info', 'log', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(arg => inspect(arg, { depth: 6 })).join(' '));
    });
  }
  return lines;
}

export async function emailVerified(userId: string) {
  // prettier-ignore
  const [row] = await recoverySql<{ emailVerified: boolean }[]>`select "emailVerified" from "user" where "id" = ${userId}`;
  return row?.emailVerified;
}

export async function cleanupResetRows() {
  gates.beforeToken = undefined;
  gates.beforeHash = undefined;
  const ids = [...resetUsers];
  resetUsers.clear();
  await Promise.all(
    ids.map(id => recoverySql`delete from "verification" where strpos("value", ${id}) > 0`)
  );
}

/** Runs a reset contract suite only where the real PostgreSQL contract lane asks for it. */
export const describeResetContract = describe.runIf(
  process.env.REQUIRE_DIFFERENT_EMAIL_RECOVERY_CONTRACT === '1'
);

/** Registers the per-test cleanup every reset contract file needs, and closes the pool once. */
export function cleanEachResetContract(mail: Mock) {
  afterEach(async () => {
    vi.restoreAllMocks();
    mail.mockReset();
    await cleanupResetRows();
    await cleanupRecoveryRows();
  });
  afterAll(() => recoverySql.end());
}
