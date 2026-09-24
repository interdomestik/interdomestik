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
} from './rls-test-connection';

test('S4 real request command, concurrency, projection and tenant RLS', async t => {
  if (!process.env.DATABASE_URL) {
    assert.notEqual(
      process.env.REQUIRE_RLS_INTEGRATION,
      '1',
      'S4 requires a database for mandatory RLS proof'
    );
    return t.skip('DATABASE_URL required');
  }
  const admin = postgres(process.env.DATABASE_URL, { max: 1 });
  const ids = Array.from({ length: 4 }, () => `s4_${randomUUID()}`);
  const [staff, member, otherMember, otherStaff] = ids;
  const claimIds = Array.from({ length: 3 }, () => `s4_${randomUUID()}`);
  const [claimId, otherClaim, foreignClaim] = claimIds;
  let restore: ReturnType<typeof applyRlsTestConnectionEnv> | undefined;
  let rls: postgres.Sql | undefined;
  try {
    await admin`select pg_advisory_lock(hashtextextended('ui03a1_rls_test_role', 0))`;
    await admin.unsafe(
      `do $$ begin create role ${quoteIdentifier(TEST_DB_ROLE)} login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; exception when duplicate_object or unique_violation then alter role ${quoteIdentifier(TEST_DB_ROLE)} with login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; end $$;`
    );
    await admin.unsafe(`grant usage on schema public to ${quoteIdentifier(TEST_DB_ROLE)}`);
    await admin.unsafe(
      `grant select, insert, update, delete on "claim_information_requests", "claim_information_request_evidence", "claim_documents", "audit_log", "claim" to ${quoteIdentifier(TEST_DB_ROLE)}`
    );
    await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      select value, 'tenant_ks', 'S4 fixture', value || '@example.test', true, 'staff', now(), now() from unnest(${ids}::text[]) as value`;
    for (const [id, tenantId, owner] of [
      [claimId, 'tenant_ks', member],
      [otherClaim, 'tenant_ks', otherMember],
      [foreignClaim, 'tenant_mk', member],
    ]) {
      await admin`insert into "claim" (id, tenant_id, access_tenant_id, "userId", "staffId", title, category, "companyName", case_lifecycle_state, recovery_lifecycle_state)
        values (${id}, ${tenantId}, ${tenantId}, ${owner}, ${staff}, 'S4 fixture', 'vehicle', 'Fixture insurer', 'verification', 'not_started')`;
    }
    restore = applyRlsTestConnectionEnv(process.env.DATABASE_URL);
    const url = new URL(process.env.DATABASE_URL);
    url.username = TEST_DB_ROLE;
    url.password = TEST_DB_PASSWORD;
    rls = postgres(url.toString(), { max: 1 });
    const { createInformationRequest, getInformationRequests } =
      await import('../../domain-claims/src/claims/information-requests');
    const { acknowledgeInformationRequestEvidence } =
      await import('../../domain-claims/src/claims/information-request-evidence');
    const { persistClaimDocumentMetadata } =
      await import('../../../apps/web/src/features/claims/upload/server/claim-document-write');
    const actor = (id: string, role = 'staff', tenantId = 'tenant_ks') => ({
      user: { id, role, tenantId },
    });
    const input = {
      claimId,
      correlationId: randomUUID(),
      requestedInformation: 'Repair estimate',
      explanationForMember: 'Needed for assessment.',
      dueAt: '2000-01-01T00:00:00.000Z',
    };
    const before = await admin`select * from "claim" where id = ${claimId}`;
    const [one, two] = await Promise.all([
      createInformationRequest(actor(staff), input),
      createInformationRequest(actor(staff), input),
    ]);
    assert.equal(one.success, true);
    assert.deepEqual(two, one);
    assert.equal(one.success && typeof one.requestId, 'string');
    const requestId = one.success ? one.requestId : assert.fail('request creation failed');
    assert.equal(
      (await admin`select id from claim_information_requests where claim_id = ${claimId}`).length,
      1
    );
    assert.deepEqual(
      await admin`select * from "claim" where id = ${claimId}`,
      before,
      'request must not mutate claim lifecycle, assignment or timers'
    );
    assert.deepEqual(
      await createInformationRequest(actor(staff), { ...input, requestedInformation: 'Changed' }),
      { success: false, error: 'conflict' }
    );
    assert.deepEqual(
      await createInformationRequest(actor(staff), { ...input, claimId: otherClaim }),
      { success: false, error: 'conflict' }
    );
    for (const denied of [
      actor(otherStaff),
      actor(member, 'member'),
      actor(staff, 'agent'),
      actor(staff, 'branch_manager'),
      actor(staff, 'staff', 'tenant_mk'),
    ]) {
      assert.deepEqual(
        await createInformationRequest(denied, { ...input, correlationId: randomUUID() }),
        { success: false, error: 'access_denied' }
      );
    }
    assert.deepEqual(
      await createInformationRequest(actor(staff), {
        ...input,
        claimId: foreignClaim,
        correlationId: randomUUID(),
      }),
      { success: false, error: 'access_denied' }
    );
    const visible = await getInformationRequests(actor(member, 'member'), claimId);
    assert.deepEqual(await getInformationRequests(actor(member, 'user'), claimId), visible);
    assert.equal(visible.length, 1);
    assert.deepEqual(Object.keys(visible[0]).sort(), [
      'createdAt',
      'dueAt',
      'evidence',
      'explanationForMember',
      'progress',
      'requestId',
      'requestedInformation',
      'slaPosture',
    ]);
    assert.equal(visible[0].slaPosture, 'incomplete');
    assert.equal(visible[0].dueAt, input.dueAt);
    assert.deepEqual(visible[0].evidence, []);
    assert.equal(visible[0].progress, 'awaiting_evidence');
    assert.deepEqual(await getInformationRequests(actor(otherMember, 'member'), claimId), []);
    assert.deepEqual(await getInformationRequests(actor(otherStaff), claimId), []);
    assert.deepEqual(
      await getInformationRequests(actor(member, 'member', 'tenant_mk'), claimId),
      []
    );
    assert.equal(
      (await rls`select id from claim_information_requests where claim_id = ${claimId}`).length,
      0,
      'missing tenant context fails closed'
    );
    await rls.begin(async tx => {
      await tx`select set_config('app.current_tenant_id', 'tenant_mk', true)`;
      assert.equal(
        (await tx`select id from claim_information_requests where claim_id = ${claimId}`).length,
        0
      );
      assert.equal(
        (
          await tx`update claim_information_requests set requested_information = 'leak' where claim_id = ${claimId} returning id`
        ).length,
        0
      );
      assert.equal(
        (await tx`delete from claim_information_requests where claim_id = ${claimId} returning id`)
          .length,
        0
      );
    });
    await assert.rejects(
      rls.begin(async tx => {
        await tx`select set_config('app.current_tenant_id', 'tenant_ks', true)`;
        await tx`insert into claim_information_requests (tenant_id, claim_id, correlation_id, requested_information, explanation_for_member, due_at, responsible_staff_id, created_by_staff_id, sla_posture)
        values ('tenant_ks', ${foreignClaim}, ${randomUUID()}, 'Forbidden', 'Forbidden', now(), ${staff}, ${staff}, 'incomplete')`;
      }),
      /row-level security/
    );
    const documentId = `s4_${randomUUID()}`;
    await persistClaimDocumentMetadata({
      category: 'evidence',
      claimId,
      fileId: documentId,
      fileSize: 1024,
      informationRequestId: requestId,
      logPrefix: '[S4 RLS proof]',
      mimeType: 'application/pdf',
      originalName: 'estimate.pdf',
      resolvedBucket: 'claim-evidence',
      storagePath: `pii/tenants/tenant_ks/claims/${claimId}/${documentId}.pdf`,
      tenantId: 'tenant_ks',
      userId: member,
    });
    assert.equal(
      (
        await admin`select document_id from claim_information_request_evidence where request_id = ${requestId} and document_id = ${documentId}`
      ).length,
      1,
      'the application upload path persists request evidence through the RLS tenant boundary'
    );

    const submitted = await getInformationRequests(actor(member, 'member'), claimId);
    assert.equal(submitted[0]?.progress, 'submitted');
    assert.deepEqual(submitted[0]?.evidence, [
      {
        documentId,
        documentName: 'estimate.pdf',
        submittedAt: submitted[0]?.evidence[0]?.submittedAt,
        acknowledgedAt: null,
      },
    ]);
    assert.deepEqual(
      await acknowledgeInformationRequestEvidence(actor(otherStaff), {
        claimId,
        requestId,
        documentId,
      }),
      { success: false, error: 'access_denied' }
    );
    const acknowledgement = await acknowledgeInformationRequestEvidence(actor(staff), {
      claimId,
      requestId,
      documentId,
    });
    assert.equal(acknowledgement.success, true);
    assert.deepEqual(
      await acknowledgeInformationRequestEvidence(actor(staff), {
        claimId,
        requestId,
        documentId,
      }),
      acknowledgement,
      'acknowledgement retry returns the durable first timestamp'
    );
    assert.equal(
      (
        await admin`select id from audit_log where action = 'claim_information_request.evidence_acknowledged' and entity_id = ${requestId}`
      ).length,
      1,
      'only the first acknowledgement writes an audit event'
    );
    const acknowledged = await getInformationRequests(actor(member, 'member'), claimId);
    assert.equal(acknowledged[0]?.progress, 'acknowledged');
    assert.equal(
      acknowledged[0]?.evidence[0]?.acknowledgedAt,
      acknowledgement.success ? acknowledgement.acknowledgedAt : null
    );
    assert.deepEqual(
      await admin`select * from "claim" where id = ${claimId}`,
      before,
      'submission and acknowledgement do not mutate claim lifecycle, assignment or timers'
    );
    assert.equal(
      (
        await rls`select document_id from claim_information_request_evidence where request_id = ${requestId}`
      ).length,
      0,
      'missing tenant context hides request-linked evidence'
    );
    await rls.begin(async tx => {
      await tx`select set_config('app.current_tenant_id', 'tenant_mk', true)`;
      assert.equal(
        (
          await tx`update claim_information_request_evidence set acknowledged_at = now(), acknowledged_by_staff_id = ${otherStaff} where request_id = ${requestId} returning document_id`
        ).length,
        0
      );
    });
    await admin`update "claim" set case_lifecycle_state = 'evaluation' where id = ${claimId}`;
    assert.deepEqual(
      await createInformationRequest(actor(staff), input),
      one,
      'retry survives a later state change'
    );
    assert.deepEqual(
      await createInformationRequest(actor(staff), { ...input, correlationId: randomUUID() }),
      { success: false, error: 'invalid_state' }
    );
  } finally {
    try {
      await admin.begin(async tx => {
        await tx`delete from audit_log where entity_id in (select id::text from claim_information_requests where claim_id = any(${claimIds}::text[]))`;
        await tx`delete from claim_information_request_evidence where claim_id = any(${claimIds}::text[])`;
        await tx`delete from claim_documents where claim_id = any(${claimIds}::text[])`;
        await tx`delete from claim_information_requests where claim_id = any(${claimIds}::text[])`;
        await tx`delete from "claim" where id = any(${claimIds}::text[])`;
        await tx`delete from "user" where id = any(${ids}::text[])`;
      });
      assert.equal(
        (
          await admin`select id from claim_information_requests where claim_id = any(${claimIds}::text[])`
        ).length,
        0
      );
    } finally {
      await rls?.end({ timeout: 5 });
      const clients = globalThis as {
        queryClientAdmin?: postgres.Sql;
        queryClientRls?: postgres.Sql;
      };
      await clients.queryClientRls?.end({ timeout: 5 });
      if (clients.queryClientAdmin !== clients.queryClientRls)
        await clients.queryClientAdmin?.end({ timeout: 5 });
      restore?.restore();
      await admin`select pg_advisory_unlock(hashtextextended('ui03a1_rls_test_role', 0))`;
      await admin.end({ timeout: 5 });
    }
  }
});
