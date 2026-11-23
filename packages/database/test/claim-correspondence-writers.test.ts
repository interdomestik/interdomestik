import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import {
  createBases,
  documentInput,
  earlier,
  homeActor,
  homeTenant,
  insertClaim,
  insertDocument,
  insertEntry,
  outboundInput,
  past,
  restricted,
  type Connection,
} from './claim-correspondence.fixture';
import { actor, ownBranch } from './claim-correspondence-domain.fixture';
import {
  conflict,
  defaults,
  otherStaff,
  whilePeerHolds,
  withWriterRegister,
  type CaseFields,
  type Domain,
} from './claim-correspondence-writers.fixture';

test('WP-12 production writers on the restricted runtime connection', async t => {
  await withWriterRegister(t, (connections, domain) => proveWriters(t, connections, domain));
});

async function proveWriters(t: TestContext, connections: Connection, domain: Domain) {
  const { admin, runtime } = connections;
  const staff = actor(homeActor, 'staff');
  const storedFields = async (claimId: string) =>
    admin`select insurance_proof_reference, updated_by_staff_id from claim_case_fields
      where claim_id = ${claimId}`;

  await t.test(
    'case fields: compare-and-set in both orders, then under a held claim lock',
    async () => {
      for (const [first, second] of [
        ['proof-a', 'proof-b'],
        ['proof-b', 'proof-a'],
      ]) {
        const claim = await insertClaim(admin, { branch: ownBranch });
        const edit = (reference: string) =>
          domain.updateGreenCardCaseFields(staff.session, staff.authority, {
            claimId: claim.id,
            ...defaults,
            insuranceProofReference: reference,
            expected: defaults,
          });
        assert.equal((await edit(first)).ok, true);
        assert.deepEqual(await edit(second), conflict, `${second} after ${first}`);
        assert.deepEqual(
          [...(await storedFields(claim.id))],
          [{ insurance_proof_reference: first, updated_by_staff_id: homeActor }]
        );
      }

      const claim = await insertClaim(admin, { branch: ownBranch });
      const result = await whilePeerHolds(
        connections,
        tx => tx`select id from claim where id = ${claim.id} for update`,
        () =>
          domain.updateGreenCardCaseFields(staff.session, staff.authority, {
            claimId: claim.id,
            ...defaults,
            insuranceProofReference: 'proof-late',
            expected: defaults,
          }),
        tx => tx`insert into claim_case_fields (tenant_id, claim_id, insurance_proof_reference,
          updated_by_staff_id) values (${homeTenant}, ${claim.id}, 'proof-peer', ${homeActor})`
      );
      assert.deepEqual(result, conflict);
      assert.deepEqual(
        [...(await storedFields(claim.id))],
        [{ insurance_proof_reference: 'proof-peer', updated_by_staff_id: homeActor }]
      );
    }
  );

  await t.test('case fields: no write after the claim is reassigned', async () => {
    const claim = await insertClaim(admin, { branch: ownBranch });
    await admin`update claim set "staffId" = ${otherStaff} where id = ${claim.id}`;
    assert.deepEqual(
      await domain.updateGreenCardCaseFields(staff.session, staff.authority, {
        claimId: claim.id,
        ...defaults,
        insuranceProofReference: 'proof-after-reassignment',
        expected: defaults,
      }),
      { ok: false, code: 'forbidden' }
    );
    assert.equal((await storedFields(claim.id)).length, 0);
  });

  await t.test(
    'case fields: populated expectations match only the same populated row',
    async () => {
      const claim = await insertClaim(admin, { branch: ownBranch });
      const absent = await insertClaim(admin, { branch: ownBranch });
      const populated = {
        otherVehicleCountryCode: 'DE',
        insuranceProofReference: 'Original proof',
        outsideHandlingParty: 'Original bureau',
        coverageVerificationStatus: 'requested',
        caseFollowUpAt: earlier,
      };
      const changed = { ...populated, insuranceProofReference: 'Updated proof' };
      const update = (claimId: string, fields: CaseFields, expected: CaseFields) =>
        domain.updateGreenCardCaseFields(staff.session, staff.authority, {
          claimId,
          ...fields,
          expected,
        });
      assert.equal((await update(claim.id, populated, defaults)).ok, true);
      assert.equal((await update(claim.id, changed, populated)).ok, true);
      assert.deepEqual(
        await update(claim.id, { ...changed, insuranceProofReference: 'Stale edit' }, populated),
        conflict
      );
      assert.deepEqual(await update(absent.id, changed, populated), conflict);
      const [stored] = await storedFields(claim.id);
      assert.deepEqual(stored, {
        insurance_proof_reference: 'Updated proof',
        updated_by_staff_id: homeActor,
      });
      assert.equal((await storedFields(absent.id)).length, 0);
    }
  );

  await t.test('follow-up: compare-and-set in sequence and under a held entry lock', async () => {
    const claim = await insertClaim(admin, { branch: ownBranch });
    const entry = await restricted(runtime, async tx => {
      const document = await insertDocument(tx, documentInput(claim));
      return insertEntry(tx, outboundInput(claim, await createBases(tx, claim, document)));
    });
    const followUp = (expectedFollowUpAt: string | null, followUpAt: string) =>
      domain.setCorrespondenceFollowUp(staff.session, staff.authority, {
        claimId: claim.id,
        correspondenceId: entry.id,
        expectedFollowUpAt,
        followUpAt,
      });
    assert.equal((await followUp(null, past)).ok, true);
    assert.deepEqual(await followUp(null, earlier), conflict);

    const result = await whilePeerHolds(
      connections,
      tx => tx`update claim_correspondence set follow_up_at = ${earlier} where id = ${entry.id}`,
      () => followUp(past, '2021-01-01T00:00:00.000Z'),
      () => Promise.resolve(undefined)
    );
    assert.deepEqual(result, conflict);
    const [stored] =
      await admin`select follow_up_at from claim_correspondence where id = ${entry.id}`;
    assert.equal(new Date(stored.follow_up_at).toISOString(), earlier);
  });

  await t.test(
    'revocation: a deadlock with a direct revoker is retried, one revocation persists',
    async () => {
      const claim = await insertClaim(admin, { branch: ownBranch });
      const bases = await restricted(runtime, async tx => {
        const document = await insertDocument(tx, documentInput(claim));
        return createBases(tx, claim, document);
      });
      const authorityId = bases.recovery.id;
      let peerOutcome: 'committed' | 'deadlock' = 'committed';
      // The peer holds the authority row; the command locks the claim, then waits on the peer;
      // the peer's direct revocation then asks for the claim lock: a deadlock.
      const result = await whilePeerHolds(
        connections,
        tx => tx`select id from claim_authorities where id = ${authorityId} for update`,
        () =>
          domain.revokeCaseAuthority(staff.session, staff.authority, {
            claimId: claim.id,
            authorityId,
          }),
        async tx => {
          try {
            await tx.savepoint(
              one => one`update claim_authorities set revoked_at = now(),
              revoked_by_user_id = ${otherStaff} where id = ${authorityId}`
            );
          } catch (error) {
            assert.equal((error as { code?: string }).code, '40P01');
            peerOutcome = 'deadlock';
          }
        }
      ).then(
        value => value,
        error => assert.fail(`the command rejected: ${String(error)}`)
      );
      assert.ok(
        result.ok || ['conflict', 'authority_invalid'].includes(result.code),
        JSON.stringify(result)
      );
      // A deadlock happened: either the peer was aborted, or the command was and its retry found
      // the peer's committed revocation.
      assert.ok(
        peerOutcome === 'deadlock' || (!result.ok && result.code === 'conflict'),
        `no deadlock observed: peer ${peerOutcome}, command ${JSON.stringify(result)}`
      );
      const revoked = await admin`select revoked_by_user_id from claim_authorities
      where id = ${authorityId} and revoked_at is not null`;
      assert.equal(revoked.length, 1);
      assert.equal(
        revoked[0].revoked_by_user_id,
        peerOutcome === 'deadlock' ? homeActor : otherStaff,
        `peer ${peerOutcome}, command ${JSON.stringify(result)}`
      );
    }
  );
}
