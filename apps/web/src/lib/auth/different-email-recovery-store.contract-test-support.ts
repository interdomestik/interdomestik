import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

export const recoverySql = postgres(
  process.env.DIFFERENT_EMAIL_RECOVERY_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  { max: 4 }
);

const owners = new Set<string>();
const challengePattern = (userId: string) => `ida-ui03b:${userId}:%`;

export async function createRecoveryOwner(label: string, email?: string) {
  const id = randomUUID();
  const address = email ?? `ida-ui03b-${label}-${randomUUID()}@example.com`;
  owners.add(id);
  await recoverySql`
    insert into "tenants" ("id", "name", "legal_name", "code", "country_code")
    values ('tenant_ks', 'Kosovo', 'Interdomestik Kosovo', 'KS', 'XK')
    on conflict ("id") do nothing
  `;
  await recoverySql`
    insert into "user"
      ("id", "tenant_id", "name", "email", "emailVerified", "role",
       "tenant_classification_pending", "createdAt", "updatedAt")
    values
      (${id}, 'tenant_ks', 'Recovery owner', ${address}, true, 'user',
       false, now(), now())
  `;
  return { id, email: address };
}

export async function challengeRows(userId: string) {
  const pattern = challengePattern(userId);
  return recoverySql<{ identifier: string; value: string }[]>`
    select "identifier", "value" from "verification"
    where "identifier" like ${pattern}
    order by "identifier"
  `;
}

export async function ownerSnapshot(userId: string) {
  const [row] = await recoverySql<
    { email: string; emailVerified: boolean; id: string; role: string; tenantId: string }[]
  >`
    select "id", "email", "emailVerified", "role", "tenant_id" as "tenantId"
    from "user" where "id" = ${userId}
  `;
  return row;
}

export async function cleanupRecoveryRows() {
  for (const id of owners) {
    const pattern = challengePattern(id);
    await recoverySql`delete from "verification" where "identifier" like ${pattern}`;
    await recoverySql`delete from "session" where "userId" = ${id}`;
    await recoverySql`delete from "account" where "userId" = ${id}`;
    await recoverySql`delete from "user" where "id" = ${id}`;
  }
  owners.clear();
}
