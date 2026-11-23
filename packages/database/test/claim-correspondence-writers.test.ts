import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import type postgres from 'postgres';

import {
  createBases,
  documentInput,
  earlier,
  foreignActor,
  foreignTenant,
  homeActor,
  homeTenant,
  insertClaim,
  insertDocument,
  insertEntry,
  inboundInput,
  insertLink,
  linkInput,
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

type Command<I, T extends object = object> = (
  session: Actor['session'],
  authority: Actor['authority'],
  input: I
) => Promise<({ ok: true } & T) | { ok: false; code: string }>;
type CaseFields = {
  otherVehicleCountryCode: string | null;
  insuranceProofReference: string | null;
  outsideHandlingParty: string | null;
  coverageVerificationStatus: string;
  caseFollowUpAt: string | null;
};
type Attention = Record<
  string,
  { nextActor: string; overdueFollowUpDueAt: string | null; overdueFollowUpSource?: string }
>;
type Domain = {
  listClaimCorrespondence: Command<{ claimId: string; page: number; perPage: number }>;
  listRegisterCitationNames: Command<
    { claimId: string; documentIds: string[] },
    { documents: { id: string; name: string }[] }
  >;
  updateGreenCardCaseFields: Command<{ claimId: string; expected: CaseFields } & CaseFields>;
  setCorrespondenceFollowUp: Command<{
    claimId: string;
    correspondenceId: string;
    expectedFollowUpAt: string | null;
    followUpAt: string | null;
  }>;
  revokeCaseAuthority: Command<{ claimId: string; authorityId: string }>;
  recordCaseAuthority: Command<{
    claimId: string;
    correlationId: string;
    kind: string;
    evidenceDocumentId: string;
    version: string;
    grantedAt: string;
  }>;
  getAssignedStaffClaimAttention: (
    session: Actor['session'],
    authority: Actor['authority'],
    claimIds: string[],
    now?: Date
  ) => Promise<Attention>;
};

const otherStaff = 'wp12-other-staff';
const branchlessStaff = 'wp12-branchless-staff';
const member = 'wp12-citation-member';
const defaults: CaseFields = {
  otherVehicleCountryCode: null,
  insuranceProofReference: null,
  outsideHandlingParty: null,
  coverageVerificationStatus: 'not_checked',
  caseFollowUpAt: null,
};
const conflict = { ok: false, code: 'conflict' };

async function loadDomain(): Promise<Domain> {
  const [fields, followUp, authorities, root, reads] = await Promise.all([
    importDomain<Pick<Domain, 'updateGreenCardCaseFields'>>('/claims/green-card-case-fields'),
    importDomain<Pick<Domain, 'setCorrespondenceFollowUp'>>('/claims/correspondence'),
    importDomain<Pick<Domain, 'recordCaseAuthority' | 'revokeCaseAuthority'>>(
      '/claims/case-authorities'
    ),
    importDomain<Pick<Domain, 'getAssignedStaffClaimAttention'>>(''),
    importDomain<Pick<Domain, 'listClaimCorrespondence' | 'listRegisterCitationNames'>>(
      '/claims/correspondence-read'
    ),
  ]);
  return {
    updateGreenCardCaseFields: fields.updateGreenCardCaseFields,
    setCorrespondenceFollowUp: followUp.setCorrespondenceFollowUp,
    revokeCaseAuthority: authorities.revokeCaseAuthority,
    recordCaseAuthority: authorities.recordCaseAuthority,
    getAssignedStaffClaimAttention: root.getAssignedStaffClaimAttention,
    ...reads,
  };
}

async function seedBranches(admin: postgres.Sql) {
  await admin`insert into branches (id, tenant_id, name, slug)
    values (${ownBranch}, ${homeTenant}, 'Own branch', 'own'),
           (${foreignBranch}, ${homeTenant}, 'Foreign branch', 'foreign')`;
  await admin`update "user" set branch_id = ${ownBranch} where id = ${homeActor}`;
  await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, branch_id, "createdAt", "updatedAt")
    values (${otherStaff}, ${homeTenant}, 'Other staff', 'wp12-other@example.test', true,
      'staff', ${ownBranch}, now(), now()),
      (${branchlessStaff}, ${homeTenant}, 'Branchless staff', 'wp12-branchless@example.test', true,
      'staff', null, now(), now()),
      (${member}, ${homeTenant}, 'Citation member', 'wp12-citation@example.test', true,
      'member', ${ownBranch}, now(), now())`;
}

async function insertRequest(admin: postgres.Sql, claimId: string, dueAt = past) {
  const [row] = await admin<{ id: string }[]>`insert into claim_information_requests (
    tenant_id, claim_id, correlation_id, requested_information, explanation_for_member,
    due_at, responsible_staff_id, created_by_staff_id, sla_posture
  ) values (${homeTenant}, ${claimId}, gen_random_uuid(), 'Case evidence', 'Please send evidence',
    ${dueAt}, ${homeActor}, ${homeActor}, 'incomplete') returning id`;
  return row.id;
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
      `grant select on claim_information_requests, claim_information_request_evidence, case_scoped_access_grants to "${connections.role}"`
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
    'register reads preserve cross-page parents and only names of cited case documents',
    async () => {
      const claim = await insertClaim(admin, { branch: ownBranch });
      const other = await insertClaim(admin, { branch: ownBranch });
      await admin`update claim set "userId" = ${member} where id in (${claim.id}, ${other.id})`;
      const { entry, evidence, sent, legal, uncited, offCase } = await restricted(
        runtime,
        async tx => {
          const evidence = await insertDocument(tx, {
            ...documentInput(claim),
            uploaded_by: member,
            name: 'Member authority.pdf',
          });
          const sent = await insertDocument(tx, {
            ...documentInput(claim, 'sent-document'),
            uploaded_by: member,
            name: 'Member evidence.pdf',
          });
          const legalDocument = {
            ...documentInput(claim),
            uploaded_by: member,
            name: 'Member legal.pdf',
            category: 'legal',
          };
          const legal = await insertDocument(tx, legalDocument);
          const uncited = await insertDocument(tx, documentInput(claim, ' sent-document '));
          const offCase = await insertDocument(tx, documentInput(other));
          await createBases(tx, other, offCase);
          const omitted = await insertDocument(tx, documentInput(claim));
          const bases = await createBases(tx, claim, evidence);
          const entry = await insertEntry(tx, {
            ...outboundInput(claim, bases, 3),
            occurred_at: earlier,
          });
          await insertLink(tx, linkInput(entry, sent));
          await insertLink(tx, linkInput(entry, legal));
          await insertLink(tx, linkInput(entry, omitted));
          for (const _ of [1, 2]) {
            await insertEntry(tx, { ...inboundInput(claim), in_reply_to_id: entry.id });
          }
          return { entry, evidence, sent, legal, uncited, offCase };
        }
      );
      const page = (number: number) =>
        domain.listClaimCorrespondence(staff.session, staff.authority, {
          claimId: claim.id,
          page: number,
          perPage: 1,
        });
      assert.partialDeepStrictEqual(await page(1), {
        ok: true,
        entries: [{ inReplyToId: entry.id }],
        replyParents: [
          { id: entry.id, partyOrganisation: entry.party_organisation, occurredAt: earlier },
        ],
      });
      assert.partialDeepStrictEqual(await page(3), {
        ok: true,
        entries: [{ id: entry.id, answered: true }],
      });
      const citationInput = {
        claimId: claim.id,
        documentIds: [sent.id, evidence.id, legal.id, uncited.id, offCase.id],
      };
      const names = await domain.listRegisterCitationNames(
        staff.session,
        staff.authority,
        citationInput
      );
      assert.equal(names.ok, true);
      assert.deepEqual(
        new Map(names.documents.map(({ id, name }) => [id, name])),
        new Map([sent, evidence, legal].map(({ id, name }) => [id, name]))
      );
      const colleague = actor(otherStaff, 'staff');
      assert.equal(
        (
          await domain.listClaimCorrespondence(colleague.session, colleague.authority, {
            claimId: claim.id,
            page: 1,
            perPage: 1,
          })
        ).ok,
        true
      );
      const readAsColleague = () =>
        domain.listRegisterCitationNames(colleague.session, colleague.authority, citationInput);
      assert.deepEqual(await readAsColleague(), { ok: true, documents: [] });
      await admin`insert into case_scoped_access_grants
        (id, tenant_id, access_tenant_id, case_id, actor_id, document_classes, created_by_id, correlation_id, expires_at)
        values (gen_random_uuid(), ${homeTenant}, ${homeTenant}, ${claim.id}, ${otherStaff}, array['evidence'],
          ${homeActor}, gen_random_uuid(), now() - interval '1 day')`;
      assert.deepEqual(await readAsColleague(), { ok: true, documents: [] });
      await admin`update case_scoped_access_grants set expires_at = null where case_id = ${claim.id}`;
      const granted = await readAsColleague();
      assert.equal(granted.ok, true);
      assert.deepEqual(
        new Map(granted.documents.map(({ id, name }) => [id, name])),
        new Map([sent, evidence].map(({ id, name }) => [id, name]))
      );
      await admin`update case_scoped_access_grants set revoked_at = now() where case_id = ${claim.id}`;
      assert.deepEqual(await readAsColleague(), { ok: true, documents: [] });
      const manager = actor(homeActor, 'branch_manager');
      assert.deepEqual(
        await domain.listRegisterCitationNames(manager.session, manager.authority, citationInput),
        { ok: false, code: 'forbidden' }
      );
      const grant = {
        claimId: claim.id,
        correlationId: randomUUID(),
        kind: 'signed_assignment',
        evidenceDocumentId: uncited.id,
        version: 'v1',
        grantedAt: past,
      };
      assert.deepEqual(await domain.recordCaseAuthority(staff.session, staff.authority, grant), {
        ok: false,
        code: 'document_invalid',
      });
      assert.equal(
        (
          await domain.recordCaseAuthority(staff.session, staff.authority, {
            ...grant,
            evidenceDocumentId: sent.id,
          })
        ).ok,
        true
      );
    }
  );

  await t.test(
    'the register picker includes eligible request evidence outside ordinary pagination',
    async () => {
      const { getAssignedStaffClaimDocuments, getRegisterPickerDocuments } =
        await import('../../../apps/web/src/features/staff/claims/server/get-assigned-claim-documents');
      const claim = await insertClaim(admin, { branch: ownBranch });
      await admin`update claim set "userId" = ${member} where id = ${claim.id}`;
      const request = await insertRequest(admin, claim.id);
      const linked = await insertDocument(admin, { ...documentInput(claim), uploaded_by: member });
      const ordinary = await insertDocument(admin, documentInput(claim));
      await admin`insert into claim_information_request_evidence (
      tenant_id, claim_id, request_id, document_id, submitted_by_member_id
    ) values (${homeTenant}, ${claim.id}, ${request}, ${linked.id}, ${member})`;

      const input = { claimId: claim.id, ...staff };
      const picker = await getRegisterPickerDocuments(input);
      assert.deepEqual(new Set(picker.map(({ id }) => id)), new Set([linked.id, ordinary.id]));
      const evidence = await getAssignedStaffClaimDocuments(input);
      assert.deepEqual(
        evidence.documents.map(({ id }) => id),
        [ordinary.id]
      );
      assert.deepEqual(
        await getRegisterPickerDocuments({ claimId: claim.id, ...actor(otherStaff, 'staff') }),
        []
      );
    }
  );

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

  await t.test('queue: register deadlines and open requests follow the claim branch', async () => {
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
    await insertRequest(admin, claim.id);
    const visible = await read();
    assert.equal(visible[claim.id]?.nextActor, 'member');
    assert.equal(visible[claim.id]?.overdueFollowUpDueAt, earlier);
    assert.equal(visible[claim.id]?.overdueFollowUpSource, 'case_register');

    await admin`update claim set branch_id = ${foreignBranch} where id = ${claim.id}`;
    const moved = await read();
    assert.equal(moved[claim.id]?.nextActor, 'untracked');
    assert.equal(moved[claim.id]?.overdueFollowUpDueAt, null);
    assert.equal(moved[claim.id]?.overdueFollowUpSource, undefined);
  });

  await t.test(
    'branchless queue progress equals case-page scope intersected with assignment',
    async () => {
      const assigned = await insertClaim(admin, { branch: ownBranch });
      const unassigned = await insertClaim(admin, { branch: ownBranch });
      const assignedElsewhere = await insertClaim(admin, { branch: foreignBranch });
      const draft = await insertClaim(admin, { branch: foreignBranch, lifecycle: 'draft' });
      await admin`update claim set "staffId" = ${branchlessStaff} where id in (${assigned.id}, ${draft.id})`;
      await admin`update claim set "staffId" = null where id = ${unassigned.id}`;
      const claimIds = [assigned.id, unassigned.id, assignedElsewhere.id, draft.id];
      for (const id of claimIds) await insertRequest(admin, id);
      const branchless = actor(branchlessStaff, 'staff', homeTenant, null);
      const progress = await domain.getAssignedStaffClaimAttention(
        branchless.session,
        branchless.authority,
        claimIds
      );
      assert.deepEqual(
        Object.entries(progress).map(([id, item]) => [id, item.nextActor]),
        [
          [assigned.id, 'member'],
          [unassigned.id, 'untracked'],
          [assignedElsewhere.id, 'untracked'],
          [draft.id, 'untracked'],
        ]
      );
    }
  );

  await t.test(
    'effective-tenant queue retains request progress and keeps register admission',
    async () => {
      const claim = await insertClaim(admin, { branch: ownBranch });
      const offBranch = await insertClaim(admin, { branch: foreignBranch });
      await restricted(
        runtime,
        tx => tx`insert into claim_case_fields
      (tenant_id, claim_id, case_follow_up_at, updated_by_staff_id)
      values (${homeTenant}, ${claim.id}, ${earlier}, ${homeActor})`
      );
      const claimIds = [claim.id, offBranch.id];
      for (const id of claimIds) await insertRequest(admin, id);
      const home = await domain.getAssignedStaffClaimAttention(
        staff.session,
        staff.authority,
        claimIds
      );
      assert.equal(home[claim.id]?.overdueFollowUpSource, 'case_register');
      assert.equal(home[claim.id]?.overdueFollowUpDueAt, earlier);

      await admin`update claim set "staffId" = ${foreignActor} where id in (${claim.id}, ${offBranch.id})`;
      const effective = actor(foreignActor, 'staff');
      const session = { user: { ...effective.session.user, tenantId: foreignTenant } };
      const progress = await domain.getAssignedStaffClaimAttention(
        session,
        effective.authority,
        claimIds
      );
      assert.equal(progress[claim.id]?.nextActor, 'member');
      assert.equal(progress[claim.id]?.overdueFollowUpDueAt, past);
      assert.equal(progress[claim.id]?.overdueFollowUpSource, undefined);
      assert.equal(progress[offBranch.id]?.nextActor, 'untracked');
      assert.equal(progress[offBranch.id]?.overdueFollowUpDueAt, null);
    }
  );

  await t.test(
    'mixed requests prioritize staff review and use the later unanswered deadline',
    async () => {
      const claim = await insertClaim(admin, { branch: ownBranch });
      const answered = await insertRequest(admin, claim.id, earlier);
      await insertRequest(admin, claim.id, past);
      const document = await insertDocument(admin, documentInput(claim));
      await admin`insert into claim_information_request_evidence (
      tenant_id, claim_id, request_id, document_id, submitted_by_member_id
    ) values (${homeTenant}, ${claim.id}, ${answered}, ${document.id}, ${claim.user})`;
      const progress = await domain.getAssignedStaffClaimAttention(staff.session, staff.authority, [
        claim.id,
      ]);
      assert.equal(progress[claim.id]?.nextActor, 'staff');
      assert.equal(progress[claim.id]?.overdueFollowUpDueAt, past);
      assert.equal(progress[claim.id]?.overdueFollowUpSource, undefined);
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
