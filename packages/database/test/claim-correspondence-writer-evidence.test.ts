import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import {
  assignedPath,
  createBases,
  documentInput,
  earlier,
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
  type Connection,
} from './claim-correspondence.fixture';
import { actor, ownBranch } from './claim-correspondence-domain.fixture';
import {
  insertRequest,
  member,
  otherStaff,
  withWriterRegister,
  type Domain,
} from './claim-correspondence-writers.fixture';

test('WP-12 register citations and picker on the restricted runtime connection', async t => {
  await withWriterRegister(t, (connections, domain) => proveEvidence(t, connections, domain));
});

async function proveEvidence(t: TestContext, connections: Connection, domain: Domain) {
  const { admin, runtime } = connections;
  const staff = actor(homeActor, 'staff');

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
          const legal = await insertDocument(tx, {
            ...documentInput(claim),
            uploaded_by: member,
            name: 'Member legal.pdf',
            category: 'legal',
          });
          const uncited = await insertDocument(
            tx,
            documentInput(claim, ' sent-document ', assignedPath(claim, randomUUID()))
          );
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
}
