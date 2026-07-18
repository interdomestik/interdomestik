import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import postgres from 'postgres';

import {
  quoteIdentifier,
  quoteSqlLiteral,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';

export const KS_TENANT_ID = 'tenant_ks';
export const MK_TENANT_ID = 'tenant_mk';

type Harness = {
  admin: postgres.Sql;
  auditId: string;
  draftMk: string;
  draftOne: string;
  draftTwo: string;
  ownerMk: string;
  ownerOne: string;
  ownerTwo: string;
  rls: postgres.Sql;
  rlsDraft: string;
};

const id = (prefix: string): string => `${prefix}_${randomUUID()}`;

export async function withRlsFixture(
  t: TestContext,
  run: (harness: Harness) => Promise<void>
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return t.skip('DATABASE_URL is required for free-start RLS proof');
  const admin = postgres(databaseUrl, { max: 1 });
  const [ownerOne, ownerTwo, ownerMk] = [
    id('draft_owner_one'),
    id('draft_owner_two'),
    id('draft_owner_mk'),
  ];
  const [draftOne, draftTwo, draftMk, rlsDraft, auditId] = Array.from({ length: 5 }, randomUUID);
  let rls: postgres.Sql | null = null;
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
      insert into "user" (
        "id", "tenant_id", "name", "email", "emailVerified", "role", "createdAt", "updatedAt"
      ) values
        (${ownerOne}, ${KS_TENANT_ID}, 'Draft owner one', ${`${ownerOne}@example.test`}, true, 'member', now(), now()),
        (${ownerTwo}, ${KS_TENANT_ID}, 'Draft owner two', ${`${ownerTwo}@example.test`}, true, 'member', now(), now()),
        (${ownerMk}, ${MK_TENANT_ID}, 'Draft owner mk', ${`${ownerMk}@example.test`}, true, 'member', now(), now())
    `;
    await admin`
      insert into "free_start_drafts" (
        "id", "tenant_id", "access_tenant_id", "owner_user_id", "client_request_id",
        "category", "resume_step"
      ) values
        (${draftOne}, ${KS_TENANT_ID}, ${KS_TENANT_ID}, ${ownerOne}, ${randomUUID()}, 'vehicle', 'category'),
        (${draftTwo}, ${KS_TENANT_ID}, ${KS_TENANT_ID}, ${ownerTwo}, ${randomUUID()}, 'property', 'details'),
        (${draftMk}, ${MK_TENANT_ID}, ${MK_TENANT_ID}, ${ownerMk}, ${randomUUID()}, 'vehicle', 'preview')
    `;
    const rlsUrl = new URL(databaseUrl);
    rlsUrl.username = TEST_DB_ROLE;
    rlsUrl.password = TEST_DB_PASSWORD;
    rls = postgres(rlsUrl.toString(), { max: 1 });
    await run({
      admin,
      auditId,
      draftMk,
      draftOne,
      draftTwo,
      ownerMk,
      ownerOne,
      ownerTwo,
      rls,
      rlsDraft,
    });
  } finally {
    await admin`delete from "audit_log" where "id" = ${auditId}`.catch(() => undefined);
    await admin`delete from "free_start_drafts" where "id" in (${draftOne}, ${draftTwo}, ${draftMk}, ${rlsDraft})`.catch(
      () => undefined
    );
    await admin`delete from "user" where "id" in (${ownerOne}, ${ownerTwo}, ${ownerMk})`.catch(
      () => undefined
    );
    await rls?.end({ timeout: 5 });
    await admin`select pg_advisory_unlock(hashtextextended('ui03a1_rls_test_role', 0))`.catch(
      () => undefined
    );
    await admin.end({ timeout: 5 });
  }
}
