import * as schema from '@interdomestik/database/schema';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

import { userSchemaConfig } from './schema';

export const sqlClient = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', {
  max: 1,
});
export const queryTrace: string[] = [];
const cleanupEmails = new Set<string>();
const db = drizzle(sqlClient, {
  schema,
  logger: { logQuery: query => queryTrace.push(query.replace(/\s+/g, ' ').trim()) },
});

export function uniqueEmail(label: string) {
  const email = `ida-ui03a0b2-${label}-${randomUUID()}@example.com`;
  cleanupEmails.add(email);
  return email;
}

export function contractAuth(delivery: () => Promise<void> = async () => {}) {
  return betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'ida-ui03a0b2-contract-secret-at-least-32-bytes',
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
    rateLimit: { enabled: false },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    plugins: [
      emailOTP({
        generateOTP: () => '123456',
        sendVerificationOTP: delivery,
        storeOTP: 'hashed',
        expiresIn: 300,
        allowedAttempts: 3,
        resendStrategy: 'rotate',
        disableSignUp: false,
      }),
    ],
  });
}

function request(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3000/api/auth/${path}`, {
    method: 'POST',
    headers: { host: 'localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function send(auth: ReturnType<typeof contractAuth>, email: string) {
  return auth.handler(request('email-otp/send-verification-otp', { email, type: 'sign-in' }));
}

export function verify(auth: ReturnType<typeof contractAuth>, email: string, otp: string) {
  return auth.handler(
    request('sign-in/email-otp', {
      email,
      otp,
      tenantId: 'tenant_ks',
      tenantClassificationPending: true,
    })
  );
}

export function cookieHeaderFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map(value => value.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

export async function insertRegisteredUser(email: string) {
  await sqlClient`
    insert into "user"
      ("id", "tenant_id", "name", "email", "emailVerified", "role", "tenant_classification_pending", "createdAt", "updatedAt")
    values
      (${randomUUID()}, 'tenant_ks', 'Registered', ${email}, true, 'user', false, now(), now())
  `;
}

export async function cleanupContractRows() {
  for (const email of cleanupEmails) {
    await sqlClient`delete from "verification" where "identifier" like ${`%${email}`}`;
    const users = await sqlClient<{ id: string }[]>`
      select "id" from "user" where "email" = ${email}
    `;
    for (const user of users) {
      await sqlClient`delete from "account" where "userId" = ${user.id}`;
      await sqlClient`delete from "session" where "userId" = ${user.id}`;
      await sqlClient`delete from "user" where "id" = ${user.id}`;
    }
  }
  cleanupEmails.clear();
  queryTrace.length = 0;
}
