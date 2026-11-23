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
  foreignActor,
  foreignTenant,
  type Connection,
} from './claim-correspondence.fixture';
import { actor, foreignBranch, ownBranch } from './claim-correspondence-domain.fixture';
import {
  branchlessStaff,
  insertRequest,
  withWriterRegister,
  type Domain,
} from './claim-correspondence-writers.fixture';

test('WP-12 assigned-claim queue on the restricted runtime connection', async t => {
  await withWriterRegister(t, (connections, domain) => proveQueue(t, connections, domain));
});

async function proveQueue(t: TestContext, connections: Connection, domain: Domain) {
  const { admin, runtime } = connections;
  const staff = actor(homeActor, 'staff');

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
}
