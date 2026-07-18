import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import postgres from 'postgres';

import { applyRlsTestConnectionEnv } from './rls-test-connection.ts';
import {
  CLAIM_FACTS,
  cleanupHandoffProof,
  OTHER_TENANT,
  seedHandoffProof,
  TENANT,
} from './free-start-draft-claim-handoff-support.ts';

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
  try {
    const before = await seedHandoffProof(admin, users, draftId);
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
    await cleanupHandoffProof(admin, users);
    await admin.end({ timeout: 5 });
  }
});
