import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import postgres from 'postgres';

import {
  applyRlsTestConnectionEnv,
  quoteIdentifier,
  quoteSqlLiteral,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';

export const TENANT_ID = 'tenant_ks';
export const facts = {
  category: 'vehicle',
  counterparty: 'Example Insurer',
  desiredOutcome: 'written_response',
  incidentDate: '2026-07-17',
  issueType: 'collision',
  resumeStep: 'preview',
  summary: 'Rear parking damage reported to the insurer.',
} as const;

type Repository = typeof import('../src/free-start-drafts');
type Admin = postgres.Sql;
type Harness = {
  admin: postgres.Sql;
  context: (ownerUserId: string) => {
    accessTenantId: string;
    actorRole: string;
    ownerUserId: string;
    tenantId: string;
  };
  repository: Repository;
  userIds: string[];
};

export async function withAuditInsertDenied(admin: Admin, run: () => Promise<void>) {
  await admin.unsafe(`revoke insert on table "audit_log" from ${quoteIdentifier(TEST_DB_ROLE)}`);
  try {
    await run();
  } finally {
    await admin.unsafe(`grant insert on table "audit_log" to ${quoteIdentifier(TEST_DB_ROLE)}`);
  }
}

export async function withRepository(
  t: TestContext,
  ownerCount: number,
  run: (harness: Harness) => Promise<void>
) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return t.skip('DATABASE_URL is required for free-start repository proof');
  const admin = postgres(databaseUrl, { max: 2 });
  const userIds = Array.from(
    { length: ownerCount },
    (_, index) => `draft_repo_${index}_${randomUUID()}`
  );
  let restoreEnv: { restore(): void } | null = null;
  try {
    await admin`select pg_advisory_lock(hashtextextended('ui03a1_rls_test_role', 0))`;
    await admin.unsafe(
      `do $$ begin create role ${quoteIdentifier(TEST_DB_ROLE)} login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; exception when duplicate_object or unique_violation then alter role ${quoteIdentifier(TEST_DB_ROLE)} with login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; end $$;`
    );
    await admin.unsafe(`grant usage on schema public to ${quoteIdentifier(TEST_DB_ROLE)}`);
    await admin.unsafe(
      `grant select, insert, update, delete on table "free_start_drafts" to ${quoteIdentifier(TEST_DB_ROLE)}`
    );
    await admin.unsafe(
      `grant select, insert on table "audit_log" to ${quoteIdentifier(TEST_DB_ROLE)}`
    );
    await admin`
      insert into "user" ("id", "tenant_id", "name", "email", "emailVerified", "role", "createdAt", "updatedAt")
      select value, ${TENANT_ID}, 'Draft owner', value || '@example.test', true, 'member', now(), now()
      from unnest(${userIds}::text[]) as value
    `;
    restoreEnv = applyRlsTestConnectionEnv(databaseUrl);
    const repository = await import('../src/free-start-drafts');
    const context = (ownerUserId: string) => ({
      accessTenantId: TENANT_ID,
      actorRole: 'member',
      ownerUserId,
      tenantId: TENANT_ID,
    });
    await run({ admin, context, repository, userIds });
  } finally {
    await admin`delete from "audit_log" where "actor_id" = any(${userIds}::text[]) and "entity_type" = 'free_start_draft'`.catch(
      () => undefined
    );
    await admin`delete from "free_start_drafts" where "owner_user_id" = any(${userIds}::text[])`.catch(
      () => undefined
    );
    await admin`delete from "user" where "id" = any(${userIds}::text[])`.catch(() => undefined);
    restoreEnv?.restore();
    await admin`select pg_advisory_unlock(hashtextextended('ui03a1_rls_test_role', 0))`.catch(
      () => undefined
    );
    await admin.end({ timeout: 5 });
  }
}
