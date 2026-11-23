import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';

// The real member-upload role rule the web validator applies (a pure module, no runtime deps).
import { isMemberUploadRole } from '../../../apps/web/src/features/claims/upload/server/member-upload-role';
import { lockClaimEvidenceObjects } from '../src/claim-evidence-object-lock';
import { assertDisposableUrl, openDisposableClient } from '../src/disposable-client';
import {
  BUCKET,
  draftAttachmentHarness,
  evidence,
  initialPath,
  INVALID_PATH_REFUSAL,
  KS,
  MK,
  objectLockKey,
  recordingTransaction as recording,
  rowId,
  seedDraftFixtures,
  sortedPaths,
  session,
  TITLE,
  type Validator,
} from './draft-claim-attachment-rls.support';
import {
  applyRlsTestConnectionEnv,
  quoteIdentifier,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';

test('R-37 draft attachments: refusal, rollback and object locks under the restricted role', async t => {
  if (!process.env.DATABASE_URL) {
    assert.notEqual(process.env.REQUIRE_RLS_INTEGRATION, '1', 'R-37 proof requires a database');
    return t.skip('DATABASE_URL required');
  }
  // R-13: role DDL, grants and fixtures only on a loopback or the confirmed CI database.
  const admin = openDisposableClient(process.env.DATABASE_URL, {
    applicationName: 'r37-draft-attachment-rls',
  });
  const ids = Array.from({ length: 4 }, rowId);
  const [member, otherMember, mkMember, auditor] = ids;
  const claimIds = Array.from({ length: 6 }, rowId);
  const [draftA, draftB, otherDraft, foreignDraft, draftC, auditorDraft] = claimIds;
  let restore: ReturnType<typeof applyRlsTestConnectionEnv> | undefined;
  let holder: postgres.Sql | undefined;
  try {
    await admin`select pg_advisory_lock(hashtextextended('ui03a1_rls_test_role', 0))`;
    await seedDraftFixtures(
      admin,
      [
        [member, KS, 'member'],
        [otherMember, KS, 'member'],
        [mkMember, MK, 'member'],
        [auditor, KS, 'auditor'],
      ],
      [
        [draftA, KS, member],
        [draftB, KS, member],
        [draftC, KS, member],
        [otherDraft, KS, otherMember],
        [foreignDraft, MK, mkMember],
        [auditorDraft, KS, auditor],
      ]
    );

    restore = applyRlsTestConnectionEnv(process.env.DATABASE_URL);
    const rlsUrl = new URL(process.env.DATABASE_URL);
    rlsUrl.username = TEST_DB_ROLE;
    rlsUrl.password = TEST_DB_PASSWORD;
    assertDisposableUrl(rlsUrl.toString());
    holder = postgres(rlsUrl.toString(), { max: 1 });

    const draft = await import('../../domain-claims/src/claims/draft');
    const attachments = await import('../../domain-claims/src/claims/draft-attachments');
    const { withTenantAuthority } = await import('../src/tenant-authority-context');
    const h = draftAttachmentHarness(admin, holder, draft);

    // Denied: another member's draft and another tenant's draft; nothing is written.
    const fileX = evidence(initialPath(KS, member, 'x'), 'x');
    assert.deepEqual(await h.update(session(member), otherDraft, [fileX]), {
      success: false,
      error: 'Access denied',
    });
    assert.deepEqual(await h.update(session(member), foreignDraft, [fileX]), {
      success: false,
      error: 'Claim not found',
    });
    assert.equal((await h.rowsOf(otherDraft)).length + (await h.rowsOf(foreignDraft)).length, 0);

    // Happy path: one row, tenant/claim/uploader from server context; a re-send is a no-op.
    assert.deepEqual(await h.update(session(member), draftA, [fileX]), { success: true });
    assert.deepEqual(
      (await h.rowsOf(draftA)).map(row => ({ ...row })),
      [
        {
          tenant_id: KS,
          claim_id: draftA,
          uploaded_by: member,
          file_path: fileX.path,
          bucket: BUCKET,
        },
      ]
    );
    // A re-send is verified like a new file; once verified it is not inserted again.
    let verified: string[] = [];
    const recordingValidator: Validator = ({ file }) => {
      verified.push(file.path);
      return Promise.resolve();
    };
    assert.deepEqual(await h.update(session(member), draftA, [fileX], recordingValidator), {
      success: true,
    });
    assert.deepEqual(verified, [fileX.path]);
    assert.equal((await h.rowsOf(draftA)).length, 1);

    // An existing file re-sent with a new one: both verified, only the new one inserted.
    const fileX2 = evidence(initialPath(KS, member, 'x2'), 'x2');
    verified = [];
    assert.deepEqual(await h.update(session(member), draftA, [fileX, fileX2], recordingValidator), {
      success: true,
    });
    const both = sortedPaths([fileX.path, fileX2.path]);
    assert.deepEqual(sortedPaths(verified), both, 'each file is verified exactly once');
    assert.deepEqual(sortedPaths((await h.rowsOf(draftA)).map(row => row.file_path)), both);

    // The re-read row-locks what it finds until commit: a row the decision rests on can be
    // neither deleted nor moved by another connection meanwhile.
    await withTenantAuthority(h.authorityOf(session(member)), async tx => {
      const rows = await attachments.readAttachedObjects(tx, {
        tenantId: KS,
        files: [fileX],
        lockRows: true,
      });
      assert.equal(rows.length, 1);
      await assert.rejects(
        admin.begin(async other => {
          await other`set local lock_timeout = '300ms'`;
          await other`delete from claim_documents where claim_id = ${draftA} and file_path = ${fileX.path}`;
        }),
        { code: '55P03' }
      );
    });
    assert.equal((await h.rowsOf(draftA)).length, 2, 'the row survives the attempted delete');
    // The same object on a second draft of the same member is refused.
    assert.deepEqual(await h.update(session(member), draftB, [fileX]), INVALID_PATH_REFUSAL);
    assert.equal(await h.titleOf(draftB), TITLE);

    // Lock contention, draft: B waits on the object lock, then sees the row committed meanwhile.
    const fileY = evidence(initialPath(KS, member, 'y'), 'y');
    const contended = await h.contend(
      objectLockKey(KS, fileY.path),
      () => h.update(session(member), draftB, [fileY]),
      () => h.insertDocument(draftC, fileY.path, member)
    );
    assert.deepEqual(contended, INVALID_PATH_REFUSAL);
    assert.equal(await h.titleOf(draftB), TITLE, 'the losing update rolls back its claim fields');
    assert.equal((await h.rowsOf(draftB)).length, 0);

    // Lock contention, submit: the helper submit runs before its insert waits, then refuses.
    const fileZ = evidence(initialPath(KS, member, 'z'), 'z');
    const submitCheck = h.contend(
      objectLockKey(KS, fileZ.path),
      () =>
        withTenantAuthority(h.authorityOf(session(member)), tx =>
          attachments.assertEvidenceObjectsUnattached(tx, { tenantId: KS, files: [fileZ] })
        ),
      () => h.insertDocument(draftC, fileZ.path, member)
    );
    await assert.rejects(submitCheck, { name: 'ClaimValidationError', code: 'INVALID_PATH' });

    // It refuses an isolation level whose snapshot would miss the previous holder's commit, before
    // it takes any lock, also when the caller only re-reads (nothing to lock).
    await admin.begin('isolation level repeatable read', async rr => {
      const { lockedIds, tx } = recording(rr);
      for (const objects of [[fileZ], []]) {
        await assert.rejects(
          lockClaimEvidenceObjects(tx, KS, objects),
          /claim evidence writes require read committed, not repeatable read/
        );
      }
      assert.deepEqual(lockedIds, [], 'no object lock is taken');
    });

    // Batches naming the same objects in opposite orders, with a repeat, lock the same
    // deduplicated 64-bit ids in ascending numeric order: one global order, no deadlock cycle.
    const pair = [fileY, fileZ];
    const expectedIds = (
      await admin`select distinct hashtextextended(k, 0)::text as id
        from unnest(${pair.map(file => objectLockKey(KS, file.path))}::text[]) as k`
    )
      .map(row => BigInt(String(row.id)))
      .sort((x, y) => (x < y ? -1 : Number(x > y)));
    for (const objects of [pair, [fileZ, fileY, fileZ]]) {
      await admin.begin(async rc => {
        const { lockedIds, tx } = recording(rc);
        await lockClaimEvidenceObjects(tx, KS, objects);
        assert.deepEqual(lockedIds, expectedIds);
      });
    }

    // Two drafts racing for one object: exactly one row.
    const fileW = evidence(initialPath(KS, member, 'w'), 'w');
    const raced = await Promise.all([
      h.update(session(member), draftB, [fileW]),
      h.update(session(member), draftC, [fileW]),
    ]);
    assert.equal(raced.filter(result => result.success).length, 1);
    assert.equal(
      (await admin`select 1 from claim_documents where file_path = ${fileW.path}`).length,
      1
    );

    // Lifecycle changed during validation: conflict; the competing edit and the rows survive.
    const fileV = evidence(initialPath(KS, member, 'v'), 'v');
    const before = await h.rowsOf(draftA);
    const competingTitle = 'R37 competing submit title';
    assert.deepEqual(
      await h.update(session(member), draftA, [fileV], async () => {
        await admin`update "claim" set case_lifecycle_state = 'submitted', title = ${competingTitle}
          where id = ${draftA}`;
      }),
      { success: false, error: 'Claim changed. Refresh and retry.', code: 'CONFLICT' }
    );
    assert.equal(await h.titleOf(draftA), competingTitle);
    assert.deepEqual(await h.rowsOf(draftA), before);
    await admin`update "claim" set case_lifecycle_state = 'draft', title = ${TITLE} where id = ${draftA}`;

    // A read-only owner (auditor): the web validator's role rule refuses any new file, so a
    // mixed existing + new request changes nothing; an existing-only re-send still succeeds.
    const roleGate =
      (role: string): Validator =>
      () =>
        isMemberUploadRole(role)
          ? Promise.resolve()
          : Promise.reject(new Error('evidence_upload_forbidden'));
    const fileOld = evidence(initialPath(KS, auditor, 'old'), 'old');
    const fileNew = evidence(initialPath(KS, auditor, 'new'), 'new');
    await h.insertDocument(auditorDraft, fileOld.path, auditor);
    const auditorRowsBefore = await h.rowsOf(auditorDraft);
    const auditorUpdate = (files: unknown[]) =>
      h.update(session(auditor, KS, 'auditor'), auditorDraft, files, roleGate('auditor'));
    assert.deepEqual(await auditorUpdate([fileOld, fileNew]), {
      success: false,
      error: 'evidence_upload_forbidden',
      code: 'INVALID_PATH',
    });
    assert.equal(await h.titleOf(auditorDraft), TITLE, 'a refused mixed request keeps the fields');
    assert.deepEqual(await h.rowsOf(auditorDraft), auditorRowsBefore);
    // Every file is verified, a re-send too: the read-only owner is refused it as well.
    assert.deepEqual(await auditorUpdate([fileOld]), {
      success: false,
      error: 'evidence_upload_forbidden',
      code: 'INVALID_PATH',
    });
    assert.deepEqual(await h.rowsOf(auditorDraft), auditorRowsBefore);
    assert.equal(await h.titleOf(auditorDraft), TITLE);

    // A failing insert after the claim update rolls the update back.
    await admin.unsafe(`revoke insert on "claim_documents" from ${quoteIdentifier(TEST_DB_ROLE)}`);
    try {
      const originalError = console.error;
      console.error = () => undefined;
      try {
        assert.deepEqual(await h.update(session(member), draftA, [fileV]), {
          success: false,
          error: 'Failed to update claim',
        });
      } finally {
        console.error = originalError;
      }
    } finally {
      await admin.unsafe(`grant insert on "claim_documents" to ${quoteIdentifier(TEST_DB_ROLE)}`);
    }
    assert.equal(await h.titleOf(draftA), TITLE);
    assert.deepEqual(await h.rowsOf(draftA), before);
  } finally {
    try {
      await admin`delete from claim_documents where claim_id = any(${claimIds}::text[])`;
      await admin`delete from "claim" where id = any(${claimIds}::text[])`;
      await admin`delete from "user" where id = any(${ids}::text[])`;
    } finally {
      await holder?.end({ timeout: 5 });
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
