import * as schema from '@interdomestik/database/schema';
import { hash } from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';

import { authRequestAuthority } from './auth-request-authority';
import * as store from './different-email-recovery-store';
import {
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

function post(auth: ResetAuth, path: string, body: Record<string, unknown>) {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth/${path}`, {
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

/** Runs `body` while deleting rows of `table` owned by `userId` raises, then removes the trap. */
export async function withDeleteFailure<T>(
  table: 'session' | 'verification',
  userId: string,
  body: () => Promise<T>
): Promise<T> {
  expect(userId).toMatch(/^[0-9a-f-]{36}$/u);
  const owned = table === 'session' ? `old."userId" = '${userId}'` : `old."value" = '${userId}'`;
  const name = `ida_acq2c_block_${table}`;
  await recoverySql.unsafe(
    `create or replace function ${name}() returns trigger language plpgsql as $$ begin ` +
      `if ${owned} then raise exception 'ACQ2C_FORCED_DELETE_FAILURE'; end if; return old; end $$; ` +
      `drop trigger if exists ${name} on "${table}"; ` +
      `create trigger ${name} before delete on "${table}" for each row execute function ${name}();`
  );
  try {
    return await body();
  } finally {
    await recoverySql.unsafe(
      `drop trigger if exists ${name} on "${table}"; drop function ${name}();`
    );
  }
}

export async function cleanupResetRows() {
  gates.beforeToken = undefined;
  gates.beforeHash = undefined;
  for (const id of resetUsers) {
    await recoverySql`delete from "verification" where "value" = ${id}`;
  }
  resetUsers.clear();
}
