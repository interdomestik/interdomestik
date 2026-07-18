import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import postgres from 'postgres';

import {
  applyRlsTestConnectionEnv,
  quoteIdentifier,
  quoteSqlLiteral,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection.ts';

const TENANT = 'tenant_ks';
const OTHER_TENANT = 'tenant_mk';
const CLAIM_FACTS = [
  'vehicle',
  'collision',
  '2026-07-17',
  'Sentinel Insurer',
  'written_response',
  'Sentinel bumper damage.',
];

test('C04/C13-C20 live handoff is isolated, atomic, idempotent and source-independent', async t => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return t.skip('DATABASE_URL is required for handoff proof');
  const admin = postgres(databaseUrl, { max: 3 });
  const users = [
    `handoff_${randomUUID()}`,
    `handoff_other_${randomUUID()}`,
    `handoff_cross_${randomUUID()}`,
  ];
  const [owner, otherOwner, crossTenantOwner] = users;
  const draftId = randomUUID();
  let restore: { restore(): void } | null = null;
  const seedMember = async (id: string, tenantId: string, name: string) => {
    await admin`insert into "user" ("id", "tenant_id", "name", "email", "emailVerified", "role", "createdAt", "updatedAt")
      values (${id}, ${tenantId}, ${name}, ${`${id}@example.test`}, true, 'member', now(), now())`;
    await admin`insert into "subscriptions" ("id", "tenant_id", "user_id", "status", "plan_id")
      values (${`sub_${id}`}, ${tenantId}, ${id}, 'active', 'ida-ui03a2-test')`;
  };
  try {
    await admin`select pg_advisory_lock(hashtextextended('ui03a2_handoff_test', 0))`;
    await admin.unsafe(
      `do $$ begin create role ${quoteIdentifier(TEST_DB_ROLE)} login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; exception when duplicate_object or unique_violation then alter role ${quoteIdentifier(TEST_DB_ROLE)} with login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; end $$;`
    );
    await admin.unsafe(`grant usage on schema public to ${quoteIdentifier(TEST_DB_ROLE)}`);
    for (const grant of [
      'select on table "tenants"',
      'select, update on table "subscriptions"',
      'select, update on table "free_start_drafts"',
      'select, insert, update on table "claim", "claim_counters"',
      'select, insert on table "claim_stage_history", "domain_events", "audit_log"',
    ])
      await admin.unsafe(`grant ${grant} to ${quoteIdentifier(TEST_DB_ROLE)}`);
    await admin`insert into "tenants" ("id", "name", "legal_name", "code", "country_code")
      values (${TENANT}, 'Kosovo', 'Interdomestik Kosovo', 'KS', 'XK')
      on conflict ("id") do update set "code" = excluded."code"`;
    await admin`insert into "tenants" ("id", "name", "legal_name", "code", "country_code")
      values (${OTHER_TENANT}, 'North Macedonia', 'Interdomestik Macedonia', 'MK', 'MK')
      on conflict ("id") do update set "code" = excluded."code"`;
    await seedMember(owner, TENANT, 'Handoff owner');
    await seedMember(otherOwner, TENANT, 'Other owner');
    await seedMember(crossTenantOwner, OTHER_TENANT, 'Cross owner');
    await admin`insert into "free_start_drafts" (
      "id", "tenant_id", "access_tenant_id", "owner_user_id", "client_request_id",
      "category", "issue_type", "incident_date", "counterparty", "desired_outcome",
      "summary", "resume_step", "version") values (
      ${draftId}, ${TENANT}, ${TENANT}, ${owner}, ${randomUUID()}, ${CLAIM_FACTS[0]},
      ${CLAIM_FACTS[1]}, ${CLAIM_FACTS[2]}, ${CLAIM_FACTS[3]}, ${CLAIM_FACTS[4]},
      ${CLAIM_FACTS[5]}, 'preview', 1)`;
    const [before] = await admin`select * from "free_start_drafts" where "id" = ${draftId}`;
    restore = applyRlsTestConnectionEnv(databaseUrl);
    const domain = await import('../../domain-claims/src/claims/free-start-draft-handoff.ts');
    const context = {
      accessTenantId: TENANT,
      actorRole: 'member',
      ownerUserId: owner,
      tenantId: TENANT,
    };

    const review = await domain.reviewFreeStartDraftHandoff(context, draftId);
    assert.equal(review.ok, true);
    if (!review.ok) return;
    assert.deepEqual(
      [
        review.facts.category,
        review.facts.issueType,
        review.facts.incidentDate,
        review.facts.counterparty,
        review.facts.desiredOutcome,
        review.facts.summary,
      ],
      CLAIM_FACTS
    );
    assert.equal(
      (await admin`select "id" from "claim" where "origin_ref_id" = ${draftId}`).length,
      0
    );

    for (const denied of [
      { accessTenantId: TENANT, actorRole: 'member', ownerUserId: otherOwner, tenantId: TENANT },
      {
        accessTenantId: OTHER_TENANT,
        actorRole: 'member',
        ownerUserId: crossTenantOwner,
        tenantId: OTHER_TENANT,
      },
    ]) {
      assert.deepEqual(await domain.reviewFreeStartDraftHandoff(denied, draftId), {
        ok: false,
        code: 'notFound',
      });
      assert.deepEqual(
        await domain.confirmFreeStartDraftHandoff(denied, {
          id: draftId,
          expectedVersion: 1,
          locale: 'en',
        }),
        { ok: false, code: 'notFound' }
      );
    }
    assert.equal(
      (await admin`select "id" from "claim" where "origin_ref_id" = ${draftId}`).length,
      0
    );
    assert.equal(
      (
        await admin`select "id" from "domain_events" where "actor_id" in (${otherOwner}, ${crossTenantOwner})`
      ).length,
      0
    );
    assert.equal(
      (
        await admin`select "id" from "audit_log" where "actor_id" in (${otherOwner}, ${crossTenantOwner})`
      ).length,
      0
    );

    let arrived = 0;
    let release!: () => void;
    const start = new Promise<void>(resolve => (release = resolve));
    const confirm = async () => {
      if (++arrived === 2) release();
      await start;
      return domain.confirmFreeStartDraftHandoff(context, {
        id: draftId,
        expectedVersion: 1,
        locale: 'en',
      });
    };
    const [left, right] = await Promise.all([confirm(), confirm()]);
    assert.equal(left.ok && right.ok, true);
    if (!left.ok || !right.ok) return;
    assert.equal(left.claimId, right.claimId);

    const linked = await admin`select * from "claim" where "tenant_id" = ${TENANT}
      and "userId" = ${owner} and "origin" = 'free_start_draft' and "origin_ref_id" = ${draftId}`;
    assert.equal(linked.length, 1);
    assert.ok(linked[0]?.claim_number);
    assert.match(
      String(linked[0]?.description),
      /Sentinel Insurer[\s\S]*2026-07-17|2026-07-17[\s\S]*Sentinel Insurer/
    );
    assert.equal(
      (await admin`select "id" from "claim_stage_history" where "claim_id" = ${left.claimId}`)
        .length,
      1
    );
    assert.equal(
      (
        await admin`select "id" from "domain_events" where "entity_id" = ${left.claimId} and "event_name" = 'case.created'`
      ).length,
      1
    );
    const audits =
      await admin`select "metadata" from "audit_log" where "entity_id" = ${left.claimId}`;
    assert.deepEqual(Array.from(audits), [
      { metadata: { draftVersion: 1, origin: 'free_start_draft' } },
    ]);
    assert.deepEqual(
      (await admin`select * from "free_start_drafts" where "id" = ${draftId}`)[0],
      before
    );
    await admin`delete from "free_start_drafts" where "id" = ${draftId}`;
    assert.equal((await admin`select "id" from "claim" where "id" = ${left.claimId}`).length, 1);
  } finally {
    restore?.restore();
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
    await admin.end({ timeout: 5 });
  }
});
