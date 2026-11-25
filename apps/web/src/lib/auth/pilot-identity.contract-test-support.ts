import * as schema from '@interdomestik/database/schema';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';

import { authRequestAuthority } from './auth-request-authority';
import { sqlClient } from './better-auth-email-otp.contract-test-support';
import { databaseHooks } from './hooks';
import { buildAuthProviders } from './providers';
import { userSchemaConfig } from './schema';

export const doorOrigin = 'http://ida.localhost:3000';
const targetTenant = 'tenant_ks';
const password = 'Synthetic-Fixture-Password1!';
export const replacementPassword = 'Synthetic-Replacement-Password2!';

export function pilotAuth(
  options: { open?: boolean; afterEmailRead?: (email: string) => Promise<void> } = {}
) {
  const adapter = drizzleAdapter(drizzle(sqlClient, { schema }), {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  });
  const database: typeof adapter = authOptions => {
    const storage = adapter(authOptions);
    return {
      ...storage,
      async findOne<T>(query: Parameters<typeof storage.findOne>[0]) {
        const row = await storage.findOne<T>(query);
        const email = query.where.find(part => part.field === 'email')?.value;
        if (query.model === 'user' && typeof email === 'string') {
          await options.afterEmailRead?.(email);
        }
        return row;
      },
    };
  };
  return betterAuth({
    ...buildAuthProviders({ IDENTITY_PUBLIC_SIGN_UP: options.open ? 'open' : undefined }),
    baseURL: doorOrigin,
    secret: 'pilot-identity-contract-only-local-secret',
    database,
    user: userSchemaConfig,
    hooks: { before: authRequestAuthority },
    databaseHooks,
    rateLimit: { enabled: false },
  });
}

export function doorRequest(path: string, body: Record<string, unknown>) {
  return new Request(`${doorOrigin}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      host: new URL(doorOrigin).host,
      origin: doorOrigin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export function signUpRequest(email: string) {
  return doorRequest('sign-up/email', {
    email,
    password,
    name: 'Pilot identity fixture',
    onboarding: { tenant: targetTenant, mode: 'deferred' },
  });
}

export function sendRequest(email: string) {
  return doorRequest('email-otp/send-verification-otp', { email, type: 'sign-in' });
}

export function verifyRequest(email: string) {
  return doorRequest('sign-in/email-otp', {
    email,
    otp: '123456',
    onboarding: { tenant: targetTenant, mode: 'deferred' },
  });
}

export async function insertDoorAccount(
  email: string,
  { tenant = targetTenant, pending = true, verified = false } = {}
) {
  const id = randomUUID();
  await sqlClient`
    insert into "user" ("id", "tenant_id", "name", "email", "emailVerified", "role",
      "tenant_classification_pending", "createdAt", "updatedAt")
    values (${id}, ${tenant}, 'Door contract account', ${email}, ${verified}, 'member',
      ${pending}, now(), now())
  `;
  const passwordHash = await buildAuthProviders({}).emailAndPassword.password.hash(password);
  await sqlClient`
    insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
    values (${randomUUID()}, ${email}, 'credential', ${id}, ${passwordHash}, now(), now())
  `;
  await sqlClient`
    insert into "session" ("id", "token", "userId", "expiresAt", "createdAt", "updatedAt")
    values (${randomUUID()}, ${randomUUID()}, ${id}, now() + interval '1 day', now(), now())
  `;
  return id;
}

export async function readDoorAccount(id: string) {
  const [owner] = await sqlClient<{ verified: boolean; pending: boolean; tenant: string }[]>`
    select "emailVerified" as verified, tenant_classification_pending as pending, tenant_id as tenant
    from "user" where id = ${id}
  `;
  const credentials = await sqlClient`
    select md5(row_to_json(a)::text) as fingerprint from "account" a
    where "userId" = ${id} and "providerId" = 'credential' order by id
  `;
  const sessions = await sqlClient`
    select md5(row_to_json(s)::text) as fingerprint from "session" s
    where "userId" = ${id} order by id
  `;
  return { owner, credentials, sessions };
}

export function userCount(email: string) {
  return sqlClient`select id from "user" where email = ${email}`;
}

export function challenges(email: string) {
  const identifierPattern = `%${email}`;
  return sqlClient`select id from "verification" where identifier like ${identifierPattern}`;
}

export function defer() {
  let resolve = () => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
