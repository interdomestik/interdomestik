import type postgres from 'postgres';

import {
  quoteIdentifier,
  quoteSqlLiteral,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';

type Sql = ReturnType<typeof postgres>;

export const CLAIM_FACTS = [
  'vehicle',
  'collision',
  '2026-07-17',
  'Sentinel Insurer',
  'written_response',
  'Sentinel bumper damage.',
] as const;
export const OTHER_TENANT = 'tenant_mk';
export const TENANT = 'tenant_ks';

export async function seedHandoffProof(
  admin: Sql,
  users: readonly string[],
  draftId: string
): Promise<unknown> {
  const [owner, otherOwner, crossTenantOwner] = users;
  if (!owner || !otherOwner || !crossTenantOwner) throw new Error('missing handoff proof users');
  await admin`select pg_advisory_lock(hashtextextended('ui03a2_handoff_test', 0))`;
  await ensureRlsRole(admin);
  await grantHandoffProofAccess(admin);
  await seedTenant(admin, TENANT, 'Kosovo', 'Interdomestik Kosovo', 'KS', 'XK');
  await seedTenant(admin, OTHER_TENANT, 'North Macedonia', 'Interdomestik Macedonia', 'MK', 'MK');
  await seedMember(admin, owner, TENANT, 'Handoff owner');
  await seedMember(admin, otherOwner, TENANT, 'Other owner');
  await seedMember(admin, crossTenantOwner, OTHER_TENANT, 'Cross owner');
  await admin`insert into "free_start_drafts" (
    "id", "tenant_id", "access_tenant_id", "owner_user_id", "client_request_id",
    "category", "issue_type", "incident_date", "counterparty", "desired_outcome",
    "summary", "resume_step", "version") values (
    ${draftId}, ${TENANT}, ${TENANT}, ${owner}, gen_random_uuid(), ${CLAIM_FACTS[0]},
    ${CLAIM_FACTS[1]}, ${CLAIM_FACTS[2]}, ${CLAIM_FACTS[3]}, ${CLAIM_FACTS[4]},
    ${CLAIM_FACTS[5]}, 'preview', 1)`;
  const [before] = await admin`select * from "free_start_drafts" where "id" = ${draftId}`;
  return before;
}

export async function cleanupHandoffProof(admin: Sql, users: readonly string[]): Promise<void> {
  await admin`delete from "audit_log" where "actor_id" = any(${users}::text[])`.catch(
    () => undefined
  );
  await admin`delete from "domain_events" where "actor_id" = any(${users}::text[])`.catch(
    () => undefined
  );
  await admin`delete from "claim_stage_history" where "changed_by_id" = any(${users}::text[])`.catch(
    () => undefined
  );
  await admin`delete from "claim" where "userId" = any(${users}::text[])`.catch(() => undefined);
  await admin`delete from "free_start_drafts" where "owner_user_id" = any(${users}::text[])`.catch(
    () => undefined
  );
  await admin`delete from "subscriptions" where "user_id" = any(${users}::text[])`.catch(
    () => undefined
  );
  await admin`delete from "user" where "id" = any(${users}::text[])`.catch(() => undefined);
  await admin`select pg_advisory_unlock(hashtextextended('ui03a2_handoff_test', 0))`.catch(
    () => undefined
  );
}

async function ensureRlsRole(admin: Sql): Promise<void> {
  await admin.unsafe(
    `do $$ begin create role ${quoteIdentifier(TEST_DB_ROLE)} login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; exception when duplicate_object or unique_violation then alter role ${quoteIdentifier(TEST_DB_ROLE)} with login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; end $$;`
  );
}

async function grantHandoffProofAccess(admin: Sql): Promise<void> {
  await admin.unsafe(`grant usage on schema public to ${quoteIdentifier(TEST_DB_ROLE)}`);
  for (const grant of [
    'select on table "tenants"',
    'select, update on table "subscriptions"',
    'select, update on table "free_start_drafts"',
    'select, insert, update on table "claim", "claim_counters"',
    'select, insert on table "claim_stage_history", "domain_events", "audit_log"',
  ])
    await admin.unsafe(`grant ${grant} to ${quoteIdentifier(TEST_DB_ROLE)}`);
}

async function seedTenant(
  admin: Sql,
  id: string,
  name: string,
  legalName: string,
  code: string,
  countryCode: string
): Promise<void> {
  await admin`insert into "tenants" ("id", "name", "legal_name", "code", "country_code")
    values (${id}, ${name}, ${legalName}, ${code}, ${countryCode})
    on conflict ("id") do update set "code" = excluded."code"`;
}

async function seedMember(admin: Sql, id: string, tenantId: string, name: string): Promise<void> {
  await admin`insert into "user" ("id", "tenant_id", "name", "email", "emailVerified", "role", "createdAt", "updatedAt")
    values (${id}, ${tenantId}, ${name}, ${`${id}@example.test`}, true, 'member', now(), now())`;
  await admin`insert into "subscriptions" ("id", "tenant_id", "user_id", "status", "plan_id")
    values (${`sub_${id}`}, ${tenantId}, ${id}, 'active', 'ida-ui03a2-test')`;
}
