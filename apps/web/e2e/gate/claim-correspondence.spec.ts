import { expect, loginAtDoor, test } from '../fixtures/one-door.fixture';
import { assertStoredDoorDocument, doorDocuments } from '../fixtures/one-door-data.fixture';
import {
  claimCorrespondence,
  claimCorrespondenceDocuments,
  dbAdmin,
  E2E_USER_IDS,
  eq,
  sql,
} from '@interdomestik/database';
import {
  claimCorrespondenceReceivedDocuments,
  claimInboundUploadDecisions,
} from '@interdomestik/database/schema';
import { formatPilotDateTime } from '../../src/lib/utils/date';
import { gotoApp } from '../utils/navigation';
import {
  copy,
  createCorrespondenceCase,
  expectRegisterSectionsOnce,
  expectQueueRowOnce,
  fillContact,
  instruments,
  openQueue,
  recordBasis,
  recordForm,
  recordOutgoing,
  registerRow,
  saveFollowUp,
  sentDocument,
  uploadCasePdf,
} from './claim-correspondence.fixture';
import {
  approvePdf,
  createMkCase,
  createSecondMkMember,
  enrollMkCase,
  expectBothDocumentGetsDenied,
  expectMemberOpensPdf,
  fileName,
  inboundPdf,
  listMkObjects,
  mkCopy,
  openCleanContext,
  placeApprovedPdf,
  proveMemberUploadDuringRollback,
  publishPdf,
  recordReceivedPdf,
  requireLocalPilotProof,
  signInSecondMember,
  staffPilotForm,
  transferMkCase,
} from './claim-correspondence-inbound.fixture';
import { proveLegacyCredentialCutover } from './claim-correspondence-cutover.fixture';
import { isMkGateProject } from './gate-project-identity';

test.describe('WP-12.1 MK pre-check', () => {
  // Signed capabilities stay in process memory. Keep request and storage traces off here.
  test.use({ trace: 'off', video: 'off', screenshot: 'off' });

  test('publishes the approved PDF before receipt and binds it to the approved member', async ({
    browser,
    door,
  }, info) => {
    test.skip(!isMkGateProject(info.project.name) || process.env.WP12_1_M5_PRECHECK !== '1');
    test.setTimeout(180_000);
    const { page: staff, origin, locale } = door;
    requireLocalPilotProof(origin);
    const successor = await createSecondMkMember();
    const claim = await createMkCase();
    await enrollMkCase(claim);
    const memberContext = await openCleanContext(browser, origin);
    const deniedContext = await openCleanContext(browser, origin);
    try {
      const former = await memberContext.newPage();
      const next = await deniedContext.newPage();
      await loginAtDoor(staff, origin, locale, 'MK_STAFF', info);
      await loginAtDoor(former, origin, locale, 'MK_MEMBER', info);
      await signInSecondMember(next, origin, successor);

      const form = await staffPilotForm(staff, origin, locale, claim, info);
      expect(await staff.evaluate(() => window.isSecureContext)).toBe(true);
      await form.getByLabel(mkCopy.inbound.file).setInputFiles(inboundPdf);
      await form
        .getByLabel(mkCopy.inbound.decisionRef)
        .fill('3c7b22a4-d80a-435e-97cb-320d2473279c');
      await form.getByRole('button', { name: mkCopy.inbound.upload }).click();
      await expect(form.getByRole('alert')).toHaveText(mkCopy.feedback.forbidden);
      expect(await listMkObjects(claim)).toHaveLength(0);
      expect(await doorDocuments(claim.id)).toHaveLength(0);
      expect(
        await dbAdmin
          .select()
          .from(claimCorrespondence)
          .where(eq(claimCorrespondence.claimId, claim.id))
      ).toHaveLength(0);

      const falsePdf = {
        ...inboundPdf,
        buffer: Buffer.from('Synthetic text without a PDF signature'),
      };
      await approvePdf(form, 'mk-receipt-invalid-pdf', falsePdf);
      await form.getByRole('button', { name: mkCopy.inbound.upload }).click();
      await expect(form.getByRole('alert')).toHaveText(mkCopy.feedback.documentInvalid);
      expect(await listMkObjects(claim)).toHaveLength(0);
      expect(await doorDocuments(claim.id)).toHaveLength(0);

      const held = await approvePdf(form, 'mk-receipt-owner-a');
      const [decision] = await dbAdmin
        .select()
        .from(claimInboundUploadDecisions)
        .where(eq(claimInboundUploadDecisions.id, held));
      expect(decision?.recipientId).toBe(E2E_USER_IDS.MK_MEMBER);
      expect(await doorDocuments(claim.id)).toHaveLength(0);
      expect(await listMkObjects(claim)).toHaveLength(0);
      await expectBothDocumentGetsDenied(former, origin, decision.documentId, [404]);
      const substituted = Buffer.from(inboundPdf.buffer);
      substituted[7] ^= 1;
      await form
        .getByLabel(mkCopy.inbound.file)
        .setInputFiles({ ...inboundPdf, buffer: substituted });
      await form.getByRole('button', { name: mkCopy.inbound.upload }).click();
      await expect(form.getByRole('alert')).toHaveText(mkCopy.feedback.documentInvalid);
      expect(await listMkObjects(claim)).toHaveLength(0);
      expect(await doorDocuments(claim.id)).toHaveLength(0);
      await form.getByLabel(mkCopy.inbound.file).setInputFiles(inboundPdf);
      // Storage succeeded in a predecessor attempt, but confirmation has yet to commit.
      await placeApprovedPdf(decision.bucket, decision.filePath);
      await expectBothDocumentGetsDenied(former, origin, decision.documentId, [404]);
      await expectBothDocumentGetsDenied(next, origin, decision.documentId, [404]);
      await publishPdf(form);
      const [document, ...rest] = await doorDocuments(claim.id);
      expect(rest).toHaveLength(0);
      expect(document).toMatchObject({
        id: decision.documentId,
        name: fileName,
        tenantId: claim.tenantId,
        uploadedBy: E2E_USER_IDS.MK_STAFF,
        fileSize: inboundPdf.buffer.length,
      });
      await assertStoredDoorDocument(document, inboundPdf.buffer);
      expect(
        await dbAdmin
          .select()
          .from(claimCorrespondenceReceivedDocuments)
          .where(eq(claimCorrespondenceReceivedDocuments.claimId, claim.id))
      ).toHaveLength(0);
      await expect(transferMkCase(claim, successor.id)).rejects.toThrow(/^P1213$/);
      await expectMemberOpensPdf(former, origin, locale, claim, document, info);
      await expectBothDocumentGetsDenied(next, origin, document.id, [403]);
      await next.goto(`${origin}/${locale}/member/claims/${claim.id}`);
      await expect(next.getByTestId('member-claim-detail-page')).toHaveCount(0);
      await recordReceivedPdf(staff, document.id);
      expect(
        await dbAdmin
          .select()
          .from(claimCorrespondenceDocuments)
          .where(eq(claimCorrespondenceDocuments.claimId, claim.id))
      ).toHaveLength(0);
      await expectMemberOpensPdf(former, origin, locale, claim, document, info);

      const transferred = await createMkCase();
      await enrollMkCase(transferred);
      const transferForm = await staffPilotForm(staff, origin, locale, transferred, info);
      const stale = await approvePdf(transferForm, 'mk-receipt-before-transfer');
      await transferMkCase(transferred, successor.id);
      await transferForm.getByRole('button', { name: mkCopy.inbound.upload }).click();
      await expect(transferForm.getByRole('alert')).toHaveText(mkCopy.feedback.forbidden);
      expect(await doorDocuments(transferred.id)).toHaveLength(0);
      expect(await listMkObjects(transferred)).toHaveLength(0);

      const fresh = await approvePdf(transferForm, 'mk-receipt-after-transfer');
      expect(fresh).not.toBe(stale);
      await publishPdf(transferForm);
      const [successorDocument, ...duplicates] = await doorDocuments(transferred.id);
      expect(duplicates).toHaveLength(0);
      expect(successorDocument?.name).toBe(fileName);
      await expectMemberOpensPdf(next, origin, locale, transferred, successorDocument, info);
      await expectBothDocumentGetsDenied(former, origin, successorDocument.id, [403]);
      const formerPage = await former.goto(`${origin}/${locale}/member/claims/${transferred.id}`);
      expect(formerPage).toBeTruthy();
      const formerHtml = await formerPage!.text();
      expect(formerHtml.includes(successorDocument.id) || formerHtml.includes(fileName)).toBe(
        false
      );
      await expect(former.getByTestId('member-claim-detail-page')).toHaveCount(0);

      await next.context().clearCookies();
      await expectBothDocumentGetsDenied(next, origin, successorDocument.id, [401]);
      await loginAtDoor(next, origin, locale, 'MK_STAFF_2', info);
      await expectBothDocumentGetsDenied(next, origin, successorDocument.id, [403]);
      await next.context().clearCookies();
      await loginAtDoor(next, origin, locale, 'KS_MEMBER', info);
      await expectBothDocumentGetsDenied(next, origin, successorDocument.id, [403, 404]);
    } finally {
      await memberContext.close();
      await deniedContext.close();
    }
  });

  test('preserves member signing and confirmation during enrolled rollback', async ({
    door,
  }, info) => {
    test.skip(!isMkGateProject(info.project.name) || process.env.WP12_1_M5_PRECHECK !== '1');
    test.setTimeout(90_000);
    const { page, origin, locale } = door;
    requireLocalPilotProof(origin);
    const claim = await createMkCase();
    await enrollMkCase(claim);
    await loginAtDoor(page, origin, locale, 'MK_MEMBER', info);
    await proveMemberUploadDuringRollback(page, origin, locale, claim, info);
  });

  test('requires a fresh decision after storage succeeds and the approval expires', async ({
    door,
  }, info) => {
    test.skip(!isMkGateProject(info.project.name) || process.env.WP12_1_M5_PRECHECK !== '1');
    test.setTimeout(90_000);
    const { page, origin, locale } = door;
    requireLocalPilotProof(origin);
    const claim = await createMkCase();
    await enrollMkCase(claim);
    await loginAtDoor(page, origin, locale, 'MK_STAFF', info);
    const form = await staffPilotForm(page, origin, locale, claim, info);
    const stale = await approvePdf(form, 'mk-expired-approval');
    const [decision] = await dbAdmin
      .select()
      .from(claimInboundUploadDecisions)
      .where(eq(claimInboundUploadDecisions.id, stale));
    await placeApprovedPdf(decision.bucket, decision.filePath);
    await dbAdmin.transaction(async tx => {
      await tx.execute(
        sql`alter table claim_inbound_upload_decisions disable trigger claim_inbound_decisions_immutable`
      );
      await tx.execute(sql`update claim_inbound_upload_decisions set decided_at = clock_timestamp() - interval '16 minutes'
        where id = ${stale}`);
      await tx.execute(
        sql`alter table claim_inbound_upload_decisions enable trigger claim_inbound_decisions_immutable`
      );
    });
    await form.getByRole('button', { name: mkCopy.inbound.upload }).click();
    await expect(form.getByRole('alert')).toHaveText(mkCopy.feedback.forbidden);
    expect(await doorDocuments(claim.id)).toHaveLength(0);
    expect(await listMkObjects(claim)).toHaveLength(1);

    expect(await approvePdf(form, 'mk-expired-approval')).not.toBe(stale);
    await publishPdf(form);
    const [published, ...rest] = await doorDocuments(claim.id);
    expect(rest).toHaveLength(0);
    expect(published?.id).not.toBe(decision.documentId);
    await assertStoredDoorDocument(published, inboundPdf.buffer);
  });

  test('storage refuses the legacy upload credential after the verified provider expiry', async ({
    browser,
    door,
  }, info) => {
    test.skip(info.project.name !== 'gate-mk-contract' || process.env.WP12_1_M5_CUTOVER !== '1');
    test.setTimeout(140 * 60 * 1000);
    await proveLegacyCredentialCutover(browser, door, info);
  });
});

test('assigned staff record legal bases, document disclosure, and an overdue unanswered contact', async ({
  door,
}, info) => {
  info.skip(info.project.name !== 'gate-ks-sq', 'The fixture uses the Kosovo staff and member');
  test.setTimeout(120_000);
  const { page, origin, locale } = door;
  const claimId = await createCorrespondenceCase();
  await loginAtDoor(page, origin, locale, 'KS_STAFF', info);
  const detail = `/${locale}/staff/claims/${claimId}`;
  await gotoApp(page, detail, info, { baseURL: origin, marker: 'staff-claim-detail-ready' });
  // The register streams in after the detail marker; the guard waits for its visible render.
  await expectRegisterSectionsOnce(page, copy.list.empty);
  await expect(page.getByTestId('staff-correspondence-list')).toContainText(copy.list.empty);

  for (const name of [...instruments.map(instrument => instrument.file), sentDocument]) {
    await uploadCasePdf(page, name);
  }
  for (const instrument of instruments) await recordBasis(page, instrument);

  const answered = 'First synthetic contact with a document';
  const unanswered = 'Second synthetic contact awaiting a reply';
  await recordOutgoing(page, answered, true);
  await expect(registerRow(page, answered)).toContainText(sentDocument);
  await recordOutgoing(page, unanswered, false);
  await saveFollowUp(registerRow(page, answered), '2020-01-06T12:00');
  await saveFollowUp(registerRow(page, unanswered), '2020-01-07T12:00');
  // The follow-up inputs are UTC; the queue shows the same instants in pilot time.
  const firstFollowUp = '2020-01-06T12:00:00.000Z';
  const secondFollowUp = '2020-01-07T12:00:00.000Z';
  await expect(page.getByTestId('staff-correspondence-overdue')).toHaveCount(2);

  const queue = await page.context().newPage();
  try {
    const overdue = await openQueue(queue, claimId, origin, locale, info);
    await expect(overdue).toBeVisible();
    await expect(overdue).toContainText(formatPilotDateTime(firstFollowUp, locale, ''));

    const form = recordForm(page);
    await form.getByLabel(copy.entry.directionLabel).selectOption('inbound');
    const reply = 'Synthetic insurer reply';
    await fillContact(form, reply);
    const replyOption = form.getByRole('option').filter({ hasText: answered });
    await expect(replyOption).toHaveCount(1);
    await form
      .getByLabel(copy.entry.replyTo)
      .selectOption({ label: await replyOption.innerText() });
    await form.getByRole('button', { name: copy.entry.record }).click();
    await expectRegisterSectionsOnce(page, reply);
    await expect(registerRow(page, reply)).toBeVisible();
    await expect(
      registerRow(page, answered).getByTestId('staff-correspondence-answered')
    ).toBeVisible();
    await expect(
      registerRow(page, unanswered).getByTestId('staff-correspondence-overdue')
    ).toBeVisible();
    await expect(page.getByTestId('staff-correspondence-overdue')).toHaveCount(1);

    // The answered contact's deadline no longer counts; the remaining unanswered one does.
    await queue.reload();
    await expectQueueRowOnce(queue, claimId, 'after reload');
    await expect(overdue).toBeVisible();
    await expect(overdue).toContainText(formatPilotDateTime(secondFollowUp, locale, ''));
    await expect(overdue).not.toContainText(formatPilotDateTime(firstFollowUp, locale, ''));
    await expectQueueRowOnce(queue, claimId, 'at the end');
  } finally {
    await queue.close();
  }
});
