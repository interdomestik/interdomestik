import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { mintTenantAuthority } from '../src/tenant-authority';
import {
  createBases,
  documentInput,
  earlier,
  foreignTenant,
  homeActor,
  homeTenant,
  inboundInput,
  insertClaim,
  insertDocument,
  insertEntry,
  insertLink,
  linkInput,
  outboundInput,
  past,
  restricted,
  withRegisterDb,
} from './claim-correspondence.fixture';

const ownBranch = 'wp12-branch-one';
const foreignBranch = 'wp12-branch-two';
const manager = 'wp12-manager';

function actor(id: string, role: string, accessTenantId = homeTenant) {
  return {
    session: { user: { id, role, tenantId: homeTenant, branchId: ownBranch, accessTenantId } },
    authority: mintTenantAuthority({
      purpose: 'test',
      tenantId: homeTenant,
      accessTenantId,
      principal: { userId: id, role, branchId: ownBranch, agentId: null },
    }),
  };
}

type Actor = ReturnType<typeof actor>;
type Reader<T> = (
  session: Actor['session'],
  authority: Actor['authority'],
  input: { claimId: string }
) => Promise<({ ok: true } & T) | { ok: false; code: string }>;

type RegisterReaders = {
  listCaseAuthorities: Reader<{ authorities: { evidenceDocumentId: string }[] }>;
  listClaimCorrespondence: Reader<{
    entries: { id: string; answered: boolean; overdue: boolean; sharedDocumentIds: string[] }[];
  }>;
  getClaimCorrespondenceSummary: Reader<{ summary: { total: number; dates: string[] } }>;
};

async function importReaders() {
  const web = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
  const entry = (name: string) => pathToFileURL(web.resolve(name)).href;
  const [correspondence, authorities] = await Promise.all([
    import(entry('@interdomestik/domain-claims/claims/correspondence-read')),
    import(entry('@interdomestik/domain-claims/claims/case-authorities')),
  ]);
  return {
    listClaimCorrespondence: correspondence.listClaimCorrespondence,
    getClaimCorrespondenceSummary: correspondence.getClaimCorrespondenceSummary,
    listCaseAuthorities: authorities.listCaseAuthorities,
  } as RegisterReaders;
}

test('WP-12 branch-scoped reader queries run through the restricted runtime connection', async t => {
  await withRegisterDb(t, async ({ admin, runtime }) => {
    await admin`insert into branches (id, tenant_id, name, slug)
      values (${ownBranch}, ${homeTenant}, 'Own branch', 'own'),
             (${foreignBranch}, ${homeTenant}, 'Foreign branch', 'foreign')`;
    await admin`update "user" set branch_id = ${ownBranch} where id = ${homeActor}`;
    await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, branch_id, "createdAt", "updatedAt")
      values (${manager}, ${homeTenant}, 'Fixture manager', 'wp12-manager@example.test', true,
        'branch_manager', ${ownBranch}, now(), now())`;
    const own = await insertClaim(admin, { branch: ownBranch });
    const foreign = await insertClaim(admin, { branch: foreignBranch });
    const noRecords = await insertClaim(admin, { branch: ownBranch });
    const draft = await insertClaim(admin, { branch: ownBranch, lifecycle: 'draft' });
    const { answered, unanswered } = await restricted(runtime, async tx => {
      const document = await insertDocument(tx, documentInput(own));
      const bases = await createBases(tx, own, document);
      const answered = await insertEntry(tx, {
        ...outboundInput(own, bases, 1),
        occurred_at: earlier,
        follow_up_at: earlier,
      });
      await insertLink(tx, linkInput(answered, document));
      const unanswered = await insertEntry(tx, {
        ...outboundInput(own, bases),
        follow_up_at: earlier,
      });
      await insertEntry(tx, { ...inboundInput(own), in_reply_to_id: answered.id });
      await insertEntry(tx, inboundInput(foreign));
      return { answered: { id: answered.id, document: document.id }, unanswered: unanswered.id };
    });

    // Supply the same guarded pools to the real package entry points as to the raw SQL proofs.
    const pools = globalThis as typeof globalThis & {
      queryClientAdmin?: typeof admin;
      queryClientRls?: typeof runtime;
    };
    const previous = {
      admin: pools.queryClientAdmin,
      runtime: pools.queryClientRls,
      role: process.env.DB_RLS_ROLE,
    };
    pools.queryClientAdmin = admin;
    pools.queryClientRls = runtime;
    delete process.env.DB_RLS_ROLE;
    try {
      const { listClaimCorrespondence, getClaimCorrespondenceSummary, listCaseAuthorities } =
        await importReaders();
      const staff = actor(homeActor, 'staff');
      const result = await listClaimCorrespondence(staff.session, staff.authority, {
        claimId: own.id,
      });
      assert.ok(result.ok);
      assert.equal(result.entries.length, 3);
      const replyReceived = result.entries.find(entry => entry.id === answered.id);
      assert.ok(replyReceived?.answered);
      assert.equal(replyReceived.overdue, false);
      assert.deepEqual(replyReceived.sharedDocumentIds, [answered.document]);
      assert.equal(result.entries.find(entry => entry.id === unanswered)?.overdue, true);
      const authorities = await listCaseAuthorities(staff.session, staff.authority, {
        claimId: own.id,
      });
      assert.ok(authorities.ok);
      assert.equal(authorities.authorities.length, 3);
      assert.ok(
        authorities.authorities.every(basis => basis.evidenceDocumentId === answered.document)
      );
      const branchManager = actor(manager, 'branch_manager');
      const summary = await getClaimCorrespondenceSummary(
        branchManager.session,
        branchManager.authority,
        { claimId: own.id }
      );
      assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
        ok: true,
        summary: { total: 3, dates: [earlier, past, past] },
      });
      assert.deepEqual(
        await getClaimCorrespondenceSummary(branchManager.session, branchManager.authority, {
          claimId: noRecords.id,
        }),
        { ok: true, summary: { total: 0, dates: [] } }
      );
      const forbidden = { ok: false, code: 'forbidden' };
      assert.deepEqual(
        await listClaimCorrespondence(branchManager.session, branchManager.authority, {
          claimId: own.id,
        }),
        forbidden
      );
      assert.deepEqual(
        await listCaseAuthorities(branchManager.session, branchManager.authority, {
          claimId: own.id,
        }),
        forbidden
      );
      for (const claimId of [foreign.id, draft.id, 'missing']) {
        assert.deepEqual(
          await listCaseAuthorities(staff.session, staff.authority, { claimId }),
          forbidden
        );
        assert.deepEqual(
          await listClaimCorrespondence(staff.session, staff.authority, { claimId }),
          forbidden
        );
        assert.deepEqual(
          await getClaimCorrespondenceSummary(branchManager.session, branchManager.authority, {
            claimId,
          }),
          forbidden
        );
      }
      const delegated = actor(homeActor, 'staff', foreignTenant);
      assert.deepEqual(
        await listClaimCorrespondence(delegated.session, delegated.authority, { claimId: own.id }),
        forbidden
      );
    } finally {
      pools.queryClientAdmin = previous.admin;
      pools.queryClientRls = previous.runtime;
      if (previous.role === undefined) delete process.env.DB_RLS_ROLE;
      else process.env.DB_RLS_ROLE = previous.role;
    }
  });
});
