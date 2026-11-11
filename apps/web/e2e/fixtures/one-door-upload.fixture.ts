import en from '../../src/messages/en/admin-claims.json';
import sq from '../../src/messages/sq/admin-claims.json';
import mk from '../../src/messages/mk/admin-claims.json';
import type { E2EUserKey } from '@interdomestik/database';
import { test as base, expect, loginAtDoor } from './one-door.fixture';
import type { Page, Request, TestInfo } from '@playwright/test';
import {
  assertDoorDocumentMetadata,
  assertStoredDoorDocument,
  doorDocuments,
  doorObjects,
  type DoorClaim,
} from './one-door-data.fixture';
import { doorStorageCapability, type DoorStorageCapability } from './one-door-storage-capability';
import { gotoApp } from '../utils/navigation';

export const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'
);
export const test = base.extend<{ doorStorage: DoorStorageCapability }>({
  doorStorage: async ({ door }, use, info) => {
    const capability = doorStorageCapability();
    info.annotations.push({
      type: 'storage-proof',
      description:
        capability === 'real-storage'
          ? `Real storage at ${door.origin}: persisted metadata, ownership and downloaded bytes.`
          : `Fallback signing at ${door.origin}: signed-action metadata/ownership and API outcomes only; no stored-byte proof.`,
    });
    await use(capability);
  },
});

export async function evidenceState(claim: DoorClaim, storage: DoorStorageCapability) {
  const documents = await doorDocuments(claim.id);
  return storage === 'real-storage'
    ? { documents, objects: await doorObjects(claim) }
    : { documents };
}

export async function assertDoorDocument(
  claim: DoorClaim,
  name: string,
  actor: E2EUserKey,
  bytes: Buffer,
  storage: DoorStorageCapability
) {
  const document = await assertDoorDocumentMetadata(claim, name, actor, bytes);
  if (storage === 'real-storage') await assertStoredDoorDocument(document, bytes);
  return document;
}

export async function signedPdf(
  page: Parameters<typeof loginAtDoor>[0],
  origin: string,
  locale: string,
  claim: DoorClaim,
  name: string,
  info: TestInfo
) {
  await gotoApp(page, `/${locale}/admin/claims/${claim.id}`, info, {
    baseURL: origin,
    marker: 'admin-page-ready',
  });
  const labels = { en, sq, mk };
  const copy = labels[locale as keyof typeof labels] ?? en;
  const trigger = page.getByRole('button', {
    name: copy.admin.claims_page.evidence.upload_button,
    exact: true,
  });
  await expect(trigger).toHaveCount(1);
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog
    .locator('#admin-evidence-file')
    .setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf });
  const [signing] = await Promise.all([
    page.waitForRequest(
      request =>
        request.method() === 'POST' &&
        Boolean(request.headers()['next-action']) &&
        Boolean(request.postData()?.includes(name))
    ),
    dialog
      .getByRole('button', { name: copy.admin.claims_page.evidence.upload_button, exact: true })
      .click(),
  ]);
  await expect(dialog).toBeHidden();
  return signing;
}

export async function expectDeniedSigning(
  page: Page,
  origin: string,
  signing: Request,
  control: DoorClaim,
  claim: DoorClaim,
  error: string
): Promise<void> {
  const body = signing.postData();
  expect(body).toContain(control.id);
  const response = await page.request.post(signing.url(), {
    headers: {
      'next-action': signing.headers()['next-action'],
      'content-type': signing.headers()['content-type'],
      Origin: origin,
    },
    data: body!.replaceAll(control.id, claim.id),
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(error);
}
