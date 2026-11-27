import assert from 'node:assert/strict';

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

export async function provePublishedScope(connections: Connection) {
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

export async function proveEnrollmentSnapshot({ admin, runtime, peer }: Connection) {
  await runSequentially([false, true], async staged => {
    const claim = await insertClaim(admin);
    const writer = staged ? { ...claim, tenant: foreignTenant, user: foreignActor } : claim;
    if (staged) {
      await admin`insert into claim_inbound_pilot_cases (tenant_id, claim_id, paused)
        values (${claim.tenant}, ${claim.id}, true)`;
    }
    await restricted(
      peer,
      async tx => {
        await setActor(tx, writer.user);
        assert.equal(
          (
            await tx`select claim_id from claim_inbound_pilot_cases
        where claim_id = ${claim.id} and enrolled_at is not null`
          ).length,
          0
        );
        await enroll(admin, claim);
        await assert.rejects(
          tx.savepoint(savepoint => insertDocument(savepoint, documentInput(writer))),
          { code: '40001' }
        );
      },
      { home: writer.tenant, isolation: 'repeatable read' }
    );
    await assert.rejects(
      restricted(runtime, async tx => {
        await setActor(tx);
        await insertDocument(tx, documentInput(claim));
      }),
      wrongCase
    );
    const [row] =
      await admin`select count(*)::int as count from claim_documents where claim_id = ${claim.id}`;
    assert.equal(row.count, 0);
  });
}
