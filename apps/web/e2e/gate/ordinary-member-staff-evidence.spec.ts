import { readFile } from 'node:fs/promises';
import {
  and,
  claimDocuments,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  db,
  eq,
} from '@interdomestik/database';
import { hasConfiguredSupabaseStorage } from '@/lib/storage/storage-credentials';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withInformationRequestFixture } from './information-request.fixture';
import {
  establishDraftTenantContext,
  idaBaseURL,
  openMemberContext,
} from './member-staff-evidence-journey.fixture';

// This is ordinary evidence: the reused isolated fixture creates no information request.
// Deterministic storage proves proxy delivery of its known placeholder, not original bucket bytes.
test('ordinary member evidence remains downloadable only by the assigned staff after reload', async ({
  browser,
  staffPage,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'gate-ks-sq', 'This journey owns an isolated KS fixture');
  test.setTimeout(120_000);
  await withInformationRequestFixture(async fixture => {
    const claimScope = and(eq(claims.id, fixture.claimId), eq(claims.tenantId, fixture.tenantId));
    const before = await db.query.claims.findFirst({ where: claimScope });
    const documentScope = and(
      eq(claimDocuments.claimId, fixture.claimId),
      eq(claimDocuments.tenantId, fixture.tenantId)
    );
    expect(await db.select().from(claimDocuments).where(documentScope)).toEqual([]);
    const baseURL = idaBaseURL(testInfo);
    const member = await openMemberContext(browser, baseURL);
    try {
      await establishDraftTenantContext(member.page, baseURL, routes.getLocale(testInfo));
      await gotoApp(member.page, routes.memberClaimDetail(fixture.claimId, testInfo), testInfo, {
        baseURL,
        marker: 'member-claim-progress-summary',
      });
      const evidence = member.page.getByTestId('ops-documents-panel').filter({ visible: true });
      await expect(evidence).toHaveCount(1);
      const upload = evidence.getByRole('button', { name: 'Ngarko dëshmi', exact: true });
      await expect(upload).toHaveCount(1);
      await upload.click();
      const dialog = member.page.getByRole('dialog').filter({ visible: true });
      await expect(dialog).toHaveCount(1);
      // Dismissal is an actual interaction; it must preserve the empty evidence list and focus.
      await dialog.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(upload).toBeFocused();
      expect(await db.select().from(claimDocuments).where(documentScope)).toEqual([]);
      await upload.click();
      const fileName = 'ordinary-evidence.pdf';
      const originalBytes = Buffer.from('%PDF-1.4\nordinary synthetic evidence\n%%EOF');
      await dialog.getByLabel('Skedari').setInputFiles({
        name: fileName,
        mimeType: 'application/pdf',
        buffer: originalBytes,
      });
      await dialog.getByRole('button', { name: 'Ngarko dëshmi', exact: true }).click();
      await expect(dialog).toHaveCount(0, { timeout: 30_000 });
      await expect(evidence.getByTestId('ops-document-row')).toHaveCount(1);
      await expect(evidence).toContainText(fileName);
      const [document] = await db.select().from(claimDocuments).where(documentScope);
      expect(document).toMatchObject({
        name: fileName,
        fileType: 'application/pdf',
        fileSize: originalBytes.length,
        tenantId: fixture.tenantId,
        claimId: fixture.claimId,
        category: 'evidence',
      });
      expect(
        await db
          .select()
          .from(claimInformationRequests)
          .where(eq(claimInformationRequests.claimId, fixture.claimId))
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(claimInformationRequestEvidence)
          .where(eq(claimInformationRequestEvidence.claimId, fixture.claimId))
      ).toEqual([]);
      expect(await db.query.claims.findFirst({ where: claimScope })).toEqual(before);
      await member.page.reload();
      await expect(evidence.getByTestId('ops-document-row')).toHaveCount(1);
      await expect(evidence).toContainText(fileName);

      await gotoApp(staffPage, routes.staffClaimDetail(fixture.claimId, testInfo), testInfo, {
        marker: 'staff-claim-detail-ready',
      });
      const panel = staffPage.getByTestId('staff-claim-documents').filter({ visible: true });
      await expect(panel).toHaveCount(1);
      await expect(panel.getByTestId('ops-document-row')).toHaveCount(1);
      await expect(panel).toContainText(fileName);
      const link = panel.getByRole('link', { name: 'Shkarko', exact: true });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', `/api/documents/${document.id}/download`);
      const downloadEvent = staffPage.waitForEvent('download');
      await link.click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toBe(fileName);
      const path = await download.path();
      expect(path).toBeTruthy();
      const expectedBytes = hasConfiguredSupabaseStorage()
        ? originalBytes
        : Buffer.from('deterministic-e2e-storage-object');
      expect(await readFile(path!)).toEqual(expectedBytes);
      await staffPage.reload();
      await expect(panel).toContainText(fileName);
      await expect(panel.getByTestId('ops-document-row')).toHaveCount(1);

      // Remove only this synthetic assignment. Same-branch page visibility grants no document access.
      await db.update(claims).set({ staffId: null }).where(claimScope);
      await staffPage.reload();
      await expect(
        staffPage.getByTestId('staff-claim-detail-ready').filter({ visible: true })
      ).toHaveCount(1);
      await expect(panel).toHaveCount(0);
      const denied = await staffPage.request.get(`/api/documents/${document.id}/download`);
      expect(denied.status()).toBe(403);
      expect(await db.select().from(claimDocuments).where(documentScope)).toHaveLength(1);
    } finally {
      await member.context.close();
    }
  });
});
