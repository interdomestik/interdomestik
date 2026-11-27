import assert from 'node:assert/strict';
import type postgres from 'postgres';

import {
  approve,
  attest,
  changeOwner,
  enroll,
  enrolledCase,
  ownerA,
  ownerB,
  publish,
  setActor,
} from './claim-correspondence-inbound-pilot.fixture';
import { withInboundJournal114 } from './claim-correspondence-inbound-reservation.fixture';
import {
  documentInput,
  foreignActor,
  foreignTenant,
  homeActor,
  homeTenant,
  insertClaim,
  insertDocument,
  restricted,
  type Connection,
} from './claim-correspondence.fixture';
import { runSequentially } from './in-order';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';

const reserved = { code: 'P1211' };
const wrongCase = { code: 'P1210' };
const frozenScope = { code: 'P1212' };
const frozenOwner = { code: 'P1213' };

async function withPeerEnrollmentHidden<T>(
  { admin, role }: Connection,
  claimId: string,
  run: () => Promise<T>
) {
  await admin.unsafe(`create policy wp12_test_hidden_enrollment on claim_inbound_pilot_cases
    as restrictive for select to ${quoteIdentifier(role)}
    using (claim_id <> ${quoteSqlLiteral(claimId)}
      or current_setting('application_name') <> 'wp12_register_peer')`);
  try {
    return await run();
  } finally {
    await admin`drop policy wp12_test_hidden_enrollment on claim_inbound_pilot_cases`;
  }
}

async function proveHiddenEnrollmentRefusal(connections: Connection) {
  const { admin, peer } = connections;
  const claim = await enrolledCase(admin);
  const attempt = documentInput(claim);
  const readState = () => admin`select c."userId" as owner, to_jsonb(p) as enrollment,
    exists (select 1 from claim_documents where id = ${attempt.id}) as persisted
    from claim c join claim_inbound_pilot_cases p
      on p.tenant_id = c.tenant_id and p.claim_id = c.id
    where c.id = ${claim.id}`;
  const before = await readState();
  assert.equal(before[0]?.owner, ownerA);
  assert.ok(before[0]?.enrollment.enrolled_at && before[0].enrollment.paused === false);
  assert.equal(before[0]?.persisted, false);
  await withPeerEnrollmentHidden(connections, claim.id, () =>
    assert.rejects(
      restricted(peer, async tx => {
        await setActor(tx);
        assert.equal((await tx`select id from claim where id = ${claim.id}`).length, 1);
        assert.equal(
          (await tx`select claim_id from claim_inbound_pilot_cases where claim_id = ${claim.id}`)
            .length,
          0
        );
        await insertDocument(tx, attempt);
      }),
      wrongCase
    )
  );
  assert.deepEqual(await readState(), before);
}

export async function provePublishedScope(connections: Connection) {
  await proveHiddenEnrollmentRefusal(connections);
  const { admin, runtime, peer, role } = connections;
  const classifications = ['intended-for-member', 'approved-to-show'] as const;

  await runSequentially(classifications, async classification => {
    const claim = await enrolledCase(admin);
    const explicitHome = classification === 'approved-to-show';
    await assert.rejects(
      restricted(runtime, tx => insertDocument(tx, documentInput(claim))),
      wrongCase
    );
    const document = await approve(connections, claim, classification);
    await assert.rejects(
      restricted(runtime, tx => insertDocument(tx, document)),
      reserved
    );
    await assert.rejects(
      restricted(runtime, tx => publish(tx, { ...document, uploaded_by: ownerB })),
      reserved
    );
    await assert.rejects(
      restricted(runtime, tx => publish(tx, { ...document, access_tenant_id: foreignTenant })),
      reserved
    );
    await assert.rejects(
      restricted(runtime, tx => publish(tx, { ...document, category: 'legal' })),
      reserved
    );
    assert.equal(await attest(admin, document), true);
    await restricted(runtime, tx => publish(tx, document, explicitHome));
    const frozen = [ownerB, explicitHome ? null : homeTenant, 'legal'] as const;
    await assert.rejects(
      restricted(
        runtime,
        tx => tx`update claim_documents set uploaded_by = ${frozen[0]}
      where id = ${document.id}`
      ),
      frozenScope
    );
    await assert.rejects(
      restricted(
        runtime,
        tx => tx`update claim_documents set access_tenant_id = ${frozen[1]}
      where id = ${document.id}`
      ),
      frozenScope
    );
    await assert.rejects(
      restricted(
        runtime,
        tx => tx`update claim_documents set category = ${frozen[2]}
      where id = ${document.id}`
      ),
      frozenScope
    );
    await restricted(
      runtime,
      tx => tx`update claim_documents set name = 'Synthetic rename',
      category = category, uploaded_by = uploaded_by, access_tenant_id = access_tenant_id where id = ${document.id}`
    );
    const [published] =
      await admin`select uploaded_by, access_tenant_id, category from claim_documents
      where id = ${document.id}`;
    assert.deepEqual(
      { ...published },
      {
        uploaded_by: homeActor,
        access_tenant_id: explicitHome ? homeTenant : null,
        category: 'evidence',
      }
    );
    await admin`delete from claim_inbound_pilot_cases where claim_id = ${claim.id}`;
    // Hide only the document. The home claim must still be writable by this restricted role.
    await admin.unsafe(`create policy wp12_test_hidden_document on claim_documents as restrictive
      for select to ${quoteIdentifier(role)} using (id <> ${quoteSqlLiteral(document.id)})`);
    try {
      await assert.rejects(
        restricted(runtime, async tx => {
          assert.equal((await tx`select id from claim where id = ${claim.id}`).length, 1);
          assert.equal(
            (await tx`select id from claim_documents where id = ${document.id}`).length,
            0
          );
          const control =
            await tx`update claim set "userId" = "userId" where id = ${claim.id} returning id`;
          assert.equal(control.length, 1);
          await changeOwner(tx, claim);
        }),
        frozenOwner
      );
    } finally {
      await admin`drop policy wp12_test_hidden_document on claim_documents`;
    }
    const [stored] = await admin`select "userId" from claim where id = ${claim.id}`;
    assert.equal(stored.userId, ownerA);
  });

  const claim = await enrolledCase(admin);
  const document = await approve(connections, claim, 'intended-for-member');
  assert.equal(await attest(admin, document), true);
  // Hold an older repeatable-read snapshot in one connection and publish in the other.
  await restricted(
    peer,
    async tx => {
      await tx`select id from claim where id = ${claim.id}`;
      await restricted(runtime, writer => publish(writer, document));
      await assert.rejects(
        tx.savepoint(savepoint => changeOwner(savepoint, claim)),
        { code: '40001' }
      );
    },
    { isolation: 'repeatable read' }
  );

  const [grants] = await admin`select
    has_table_privilege(${role}, 'public.claim_inbound_pilot_cases', 'INSERT') as enroll,
    has_table_privilege(${role}, 'public.claim_inbound_upload_decisions', 'UPDATE') as edit,
    has_column_privilege(${role}, 'public.claim_inbound_upload_decisions', 'decided_at', 'INSERT') as date,
    has_function_privilege(${role}, 'public.claim_inbound_owner_guard_fn()', 'EXECUTE') as lookup`;
  assert.deepEqual({ ...grants }, { enroll: false, edit: false, date: false, lookup: false });
}

type EnrollmentRace = 'first enrollment' | 'hidden staged activation' | 'hidden joined activation';

async function proveEnrollmentRace(connections: Connection, race: EnrollmentRace) {
  const { admin, runtime, peer } = connections;
  const claim = await insertClaim(admin);
  const legacyForeign = race === 'hidden staged activation';
  const hideJoinedEnrollment = race === 'hidden joined activation';
  const writer = legacyForeign ? { ...claim, tenant: foreignTenant, user: foreignActor } : claim;
  const staleDocument = documentInput(writer);
  const freshDocument = documentInput(claim);
  const readEnrollment = async (sql: postgres.Sql | postgres.TransactionSql) => [
    ...(await sql`select tenant_id, extract(epoch from enrolled_at)::text as enrolled_at,
      paused, legacy_credential_disposition
      from claim_inbound_pilot_cases where claim_id = ${claim.id}`),
  ];

  const initial =
    race === 'first enrollment'
      ? []
      : [
          {
            tenant_id: claim.tenant,
            enrolled_at: null,
            paused: true,
            legacy_credential_disposition: null,
          },
        ];
  if (initial.length) {
    await admin`insert into claim_inbound_pilot_cases (tenant_id, claim_id, paused)
        values (${claim.tenant}, ${claim.id}, true)`;
  }
  // The privileged reader establishes that the legacy foreign writer's empty view hides a real row.
  assert.deepEqual(await readEnrollment(admin), initial);
  const staleView = legacyForeign || hideJoinedEnrollment ? [] : initial;

  const activatePastSnapshot = () =>
    restricted(
      peer,
      async tx => {
        await setActor(tx, writer.user);
        assert.deepEqual(await readEnrollment(tx), staleView);
        await enroll(admin, claim);

        const freshView = await restricted(runtime, fresh => readEnrollment(fresh));
        const [enrollment] = freshView;
        assert.match(enrollment?.enrolled_at ?? '', /^\d+(?:\.\d+)?$/u);
        assert.deepEqual(freshView, [
          {
            tenant_id: claim.tenant,
            enrolled_at: enrollment.enrolled_at,
            paused: false,
            legacy_credential_disposition: 'none-issued',
          },
        ]);
        assert.deepEqual(await readEnrollment(tx), staleView);
        await assert.rejects(
          tx.savepoint(savepoint => insertDocument(savepoint, staleDocument)),
          { code: '40001' }
        );
        return freshView;
      },
      { home: writer.tenant, isolation: 'repeatable read' }
    );

  const active = hideJoinedEnrollment
    ? await withPeerEnrollmentHidden(connections, claim.id, activatePastSnapshot)
    : await activatePastSnapshot();

  const assertUnchanged = async () => {
    const [result] = await admin`select c."userId" as owner, exists (
      select 1 from claim_documents where claim_id = c.id
        or id in (${staleDocument.id}, ${freshDocument.id})
    ) as persisted from claim c where c.id = ${claim.id}`;
    assert.deepEqual({ ...result }, { owner: claim.user, persisted: false });
    assert.deepEqual(await readEnrollment(admin), active);
  };
  await assertUnchanged();
  await assert.rejects(
    restricted(runtime, async tx => {
      await setActor(tx);
      await insertDocument(tx, freshDocument);
    }),
    wrongCase
  );
  await assertUnchanged();
}

export async function proveEnrollmentSnapshot(connections: Connection) {
  await withInboundJournal114(async legacy => {
    await proveEnrollmentRace(legacy, 'first enrollment');
    await proveEnrollmentRace(legacy, 'hidden staged activation');
  });
  await runSequentially(['first enrollment', 'hidden joined activation'] as const, race =>
    proveEnrollmentRace(connections, race)
  );
}
