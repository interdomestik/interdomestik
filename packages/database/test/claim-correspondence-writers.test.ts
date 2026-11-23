import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type postgres from 'postgres';

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
  withRegisterDb,
  type Connection,
} from './claim-correspondence.fixture';
import {
  actor,
  foreignBranch,
  importDomain,
  ownBranch,
  runtimePid,
  waitUntilBlocked,
  withDomainPools,
  type Actor,
} from './claim-correspondence-domain.fixture';

type Result = { ok: true } | { ok: false; code: string };
type Command<I> = (
  session: Actor['session'],
  authority: Actor['authority'],
  input: I
) => Promise<Result>;
type CaseFields = {
  otherVehicleCountryCode: string | null;
  insuranceProofReference: string | null;
  outsideHandlingParty: string | null;
  coverageVerificationStatus: string;
  caseFollowUpAt: string | null;
};
type Attention = Record<
  string,
  { overdueFollowUpDueAt: string | null; overdueFollowUpSource?: string }
>;
type Domain = {
  updateGreenCardCaseFields: Command<{ claimId: string; expected: CaseFields } & CaseFields>;
  setCorrespondenceFollowUp: Command<{
    claimId: string;
    correspondenceId: string;
    expectedFollowUpAt: string | null;
    followUpAt: string | null;
  }>;
  revokeCaseAuthority: Command<{ claimId: string; authorityId: string }>;
  getAssignedStaffClaimAttention: (
    session: Actor['session'],
    authority: Actor['authority'],
    claimIds: string[],
    now?: Date
  ) => Promise<Attention>;
  updateDraftClaimCore: (
    params: Record<string, unknown>
  ) => Promise<{ success: boolean; error?: string; code?: string }>;
};

const otherStaff = 'wp12-other-staff';
const defaults: CaseFields = {
  otherVehicleCountryCode: null,
  insuranceProofReference: null,
  outsideHandlingParty: null,
  coverageVerificationStatus: 'not_checked',
  caseFollowUpAt: null,
};
const conflict = { ok: false, code: 'conflict' };

async function loadDomain(): Promise<Domain> {
  const [fields, followUp, authorities, root, draft] = await Promise.all([
    importDomain<Pick<Domain, 'updateGreenCardCaseFields'>>('/claims/green-card-case-fields'),
    importDomain<Pick<Domain, 'setCorrespondenceFollowUp'>>('/claims/correspondence'),
    importDomain<Pick<Domain, 'revokeCaseAuthority'>>('/claims/case-authorities'),
    importDomain<Pick<Domain, 'getAssignedStaffClaimAttention'>>(''),
    importDomain<Pick<Domain, 'updateDraftClaimCore'>>('/claims/draft'),
  ]);
  return {
    updateGreenCardCaseFields: fields.updateGreenCardCaseFields,
    setCorrespondenceFollowUp: followUp.setCorrespondenceFollowUp,
    revokeCaseAuthority: authorities.revokeCaseAuthority,
    getAssignedStaffClaimAttention: root.getAssignedStaffClaimAttention,
    updateDraftClaimCore: draft.updateDraftClaimCore,
  };
}

async function seedBranches(admin: postgres.Sql) {
  await admin`insert into branches (id, tenant_id, name, slug)
    values (${ownBranch}, ${homeTenant}, 'Own branch', 'own'),
           (${foreignBranch}, ${homeTenant}, 'Foreign branch', 'foreign')`;
  await admin`update "user" set branch_id = ${ownBranch} where id = ${homeActor}`;
  await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, branch_id, "createdAt", "updatedAt")
    values (${otherStaff}, ${homeTenant}, 'Other staff', 'wp12-other@example.test', true,
      'staff', ${ownBranch}, now(), now())`;
}

/**
 * Runs `command` on the runtime connection while the peer holds `lock`; once the command waits
 * on the peer, `compete` runs in the peer transaction, which then commits.
 */
async function whilePeerHolds<T>(
  { admin, peer }: Connection,
  lock: (tx: postgres.TransactionSql) => Promise<unknown>,
  command: () => Promise<T>,
  compete: (tx: postgres.TransactionSql) => Promise<unknown>
) {
  let pending: Promise<T> | undefined;
  await restricted(peer, async tx => {
    const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
    await lock(tx);
    pending = command();
    pending.catch(() => undefined);
    await waitUntilBlocked(admin, () => runtimePid(admin), pid);
    await compete(tx);
  });
  return pending!;
}

test('WP-12 production writers on the restricted runtime connection', async t => {
  await withRegisterDb(t, async connections => {
    await seedBranches(connections.admin);
    // The queue read also reads member requests; the fixture role grants only register tables.
    await connections.admin.unsafe(
      `grant select on claim_information_requests, claim_information_request_evidence to "${connections.role}"`
    );
    // The domain binds its database client on import: load it once the pools are in place.
    await withDomainPools(connections.admin, connections.runtime, async () =>
      proveWriters(t, connections, await loadDomain())
    );
  });
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

  await t.test('queue: register deadlines follow the claim branch (Astra code r1 B1)', async () => {
    const claim = await insertClaim(admin, { branch: ownBranch });
    await restricted(runtime, async tx => {
      const document = await insertDocument(tx, documentInput(claim));
      const bases = await createBases(tx, claim, document);
      await insertEntry(tx, { ...outboundInput(claim, bases), follow_up_at: past });
      await tx`insert into claim_case_fields (tenant_id, claim_id, case_follow_up_at, updated_by_staff_id)
        values (${homeTenant}, ${claim.id}, ${earlier}, ${homeActor})`;
    });
    const read = () =>
      domain.getAssignedStaffClaimAttention(staff.session, staff.authority, [claim.id]);
    const visible = await read();
    assert.equal(visible[claim.id]?.overdueFollowUpDueAt, earlier);
    assert.equal(visible[claim.id]?.overdueFollowUpSource, 'case_register');

    await admin`update claim set branch_id = ${foreignBranch} where id = ${claim.id}`;
    const moved = await read();
    assert.equal(moved[claim.id]?.overdueFollowUpDueAt, null);
    assert.equal(moved[claim.id]?.overdueFollowUpSource, undefined);
  });

  await t.test(
    'draft edit: a submission that commits first turns the edit into a conflict',
    async () => {
      const draft = await insertClaim(admin, { lifecycle: 'draft', category: 'property' });
      const member = actor(homeActor, 'member', homeTenant, null);
      const result = await whilePeerHolds(
        connections,
        tx => tx`update claim set case_lifecycle_state = 'submitted' where id = ${draft.id}
        and case_lifecycle_state = 'draft'`,
        () =>
          domain.updateDraftClaimCore({
            authority: member.authority,
            session: member.session,
            requestHeaders: new Headers(),
            claimId: draft.id,
            data: {
              category: 'vehicle',
              title: 'Edited draft title',
              companyName: 'Example organisation',
              description: 'A description long enough for the claim validator.',
              currency: 'EUR',
              files: [],
            },
          }),
        () => Promise.resolve(undefined)
      );
      assert.deepEqual(result, {
        success: false,
        error: 'Claim changed. Refresh and retry.',
        code: 'CONFLICT',
      });
      const [stored] =
        await admin`select case_lifecycle_state, category from claim where id = ${draft.id}`;
      assert.deepEqual(stored, { case_lifecycle_state: 'submitted', category: 'property' });
    }
  );

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
