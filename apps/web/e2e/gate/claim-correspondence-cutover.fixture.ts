import { setTimeout as delay } from 'node:timers/promises';
import { createAdminClient, dbAdmin, eq, sql } from '@interdomestik/database';
import { claimInboundPilotCases } from '@interdomestik/database/schema';
import type { Browser, Page, Request, Route, TestInfo } from '@playwright/test';
import { doorDocuments } from '../fixtures/one-door-data.fixture';
import { expect, loginAtDoor } from '../fixtures/one-door.fixture';
import { gotoApp } from '../utils/navigation';
import {
  createMkCase,
  expectBothDocumentGetsDenied,
  inboundPdf,
  listMkObjects,
  mkCopy,
  openCleanContext,
  requireLocalPilotProof,
  type MkCase,
} from './claim-correspondence-inbound.fixture';

const providerLifetimeMs = 2 * 60 * 60 * 1000;
const skewMs = 5_000;

function requestLegacyCredential(member: Page, origin: string, claimId: string) {
  return member.request.post(`${origin}/api/uploads`, {
    data: {
      claimId,
      fileName: inboundPdf.name,
      fileType: inboundPdf.mimeType,
      fileSize: inboundPdf.buffer.length,
    },
    maxRedirects: 0,
  });
}

type LocalCredential = { id: string; bucket: string; path: string; url: URL; expiresAt: number };

async function readCredential(
  response: Awaited<ReturnType<typeof requestLegacyCredential>>,
  storage: URL
): Promise<LocalCredential> {
  expect(response.status()).toBe(200);
  try {
    const reply: unknown = await response.json();
    if (!reply || typeof reply !== 'object' || !('upload' in reply)) throw new Error();
    const upload = reply.upload;
    if (
      !upload ||
      typeof upload !== 'object' ||
      !('id' in upload) ||
      typeof upload.id !== 'string' ||
      !('bucket' in upload) ||
      typeof upload.bucket !== 'string' ||
      !('path' in upload) ||
      typeof upload.path !== 'string' ||
      !('signedUrl' in upload) ||
      typeof upload.signedUrl !== 'string'
    )
      throw new Error();
    const url = new URL(upload.signedUrl);
    const token = url.searchParams.get('token')?.split('.') ?? [];
    const target = `/storage/v1/object/upload/sign/${upload.bucket}/${upload.path}`;
    if (url.origin !== storage.origin || url.pathname !== target || token.length !== 3)
      throw new Error();
    const parsed: unknown = JSON.parse(Buffer.from(token[1], 'base64url').toString('utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('exp' in parsed) ||
      typeof parsed.exp !== 'number' ||
      !Number.isSafeInteger(parsed.exp) ||
      parsed.exp * 1000 <= Date.now()
    )
      throw new Error();
    return {
      id: upload.id,
      bucket: upload.bucket,
      path: upload.path,
      url,
      expiresAt: parsed.exp * 1000,
    };
  } catch {
    throw new Error('Expected a real local storage signing response with a future provider expiry');
  }
}

async function directStoragePut(credential: LocalCredential) {
  try {
    return await fetch(credential.url, {
      method: 'PUT',
      redirect: 'error',
      headers: { 'Content-Type': inboundPdf.mimeType, 'x-upsert': 'false' },
      body: new Uint8Array(inboundPdf.buffer),
    });
  } catch {
    throw new Error('Could not reach the local signed-upload endpoint');
  }
}

async function captureLegacyActions(
  staff: Page,
  origin: string,
  locale: string,
  claim: MkCase,
  info: TestInfo
) {
  const pagePath = `/${locale}/staff/claims/${claim.id}`;
  await gotoApp(staff, pagePath, info, { baseURL: origin, marker: 'staff-claim-detail-ready' });
  const label = mkCopy.documents.upload;
  const trigger = staff
    .getByTestId('staff-case-register')
    .getByRole('button', { name: label, exact: true });
  await trigger.click();
  const dialog = staff.getByRole('dialog', { name: label });
  await dialog.getByLabel(mkCopy.documents.type).click();
  await staff.getByRole('option', { name: mkCopy.documents.evidence, exact: true }).click();
  await dialog.getByLabel(mkCopy.documents.file).setInputFiles(inboundPdf);
  const matches = (request: Request) =>
    request.method() === 'POST' &&
    Boolean(request.headers()['next-action']) &&
    Boolean(request.postData()?.includes(inboundPdf.name));
  const confirm = (request: Request) =>
    matches(request) && Boolean(request.postData()?.includes('"uploadIntentToken"'));
  const submit = (request: Request) => matches(request) && !confirm(request);

  const endpoint = origin + pagePath;
  const stopConfirmation = (route: Route) =>
    confirm(route.request()) ? route.abort() : route.continue();
  await staff.route(endpoint, stopConfirmation);
  try {
    const [signing, confirmation] = await Promise.all([
      staff.waitForRequest(submit),
      staff.waitForEvent('requestfailed', { predicate: confirm }),
      dialog.getByRole('button', { name: label, exact: true }).click(),
    ]);
    expect(await doorDocuments(claim.id)).toHaveLength(0);
    expect(await listMkObjects(claim)).toHaveLength(1);
    return { signing, confirmation };
  } finally {
    await staff.unroute(endpoint, stopConfirmation);
  }
}

async function replayLegacyAction(
  staff: Page,
  origin: string,
  action: Request,
  data = action.postData() ?? ''
) {
  const response = await staff.request.post(action.url(), {
    data,
    headers: {
      Origin: origin,
      'Content-Type': action.headers()['content-type'],
      'Next-Action': action.headers()['next-action'],
    },
    maxRedirects: 0,
  });
  return response;
}

async function expectLegacyActionClosed(staff: Page, origin: string, action: Request) {
  const response = await replayLegacyAction(staff, origin, action);
  expect(response.status()).toBe(200);
  // A Flight response can carry signed URLs if this assertion fails. Compare only a boolean.
  expect((await response.text()).includes('"status":403')).toBe(true);
}

async function proveEnrollmentReadFailure(
  staff: Page,
  origin: string,
  claim: MkCase,
  source: MkCase,
  signing: Request
) {
  const role = decodeURIComponent(new URL(process.env.E2E_SERVER_DATABASE_URL_RLS!).username);
  const policy = sql.identifier(`wp12_test_enrollment_read_${claim.id}`);
  // The disposable case ID is generated by createMkCase. DDL cannot bind a query parameter.
  if (!/^wp12-mk-[a-f0-9-]{36}$/.test(claim.id)) throw new Error('Expected a synthetic case ID');
  const caseLiteral = sql.raw("'" + claim.id + "'");
  await dbAdmin.transaction(async tx => {
    await tx.insert(claimInboundPilotCases).values({
      claimId: claim.id,
      tenantId: claim.tenantId,
      enrolledAt: new Date(),
      legacyCredentialDisposition: 'none-issued',
    });
    await tx.execute(sql`create policy ${policy} on claim_inbound_pilot_cases as restrictive
      for select to ${sql.identifier(role)} using (case when claim_id = ${caseLiteral}
        then current_setting('wp12.test_missing_enrollment_setting') is not null else true end)`);
  });
  try {
    const original = signing.postData() ?? '';
    expect(original.includes(source.id)).toBe(true);
    const response = await replayLegacyAction(
      staff,
      origin,
      signing,
      original.replaceAll(source.id, claim.id)
    );
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body.includes('"status":500') && body.includes('"error":"evidence_upload_failed"')).toBe(
      true
    );
    expect(await doorDocuments(claim.id)).toHaveLength(0);
    expect(await listMkObjects(claim)).toHaveLength(0);
  } finally {
    await dbAdmin.transaction(async tx => {
      await tx.execute(sql`drop policy ${policy} on claim_inbound_pilot_cases`);
      await tx.delete(claimInboundPilotCases).where(eq(claimInboundPilotCases.claimId, claim.id));
    });
  }
}

async function closeWhileSigning(member: Page, origin: string, claim: MkCase) {
  const signing: { response?: ReturnType<typeof requestLegacyCredential> } = {};
  try {
    await dbAdmin.transaction(async tx => {
      await tx.execute(sql`set local lock_timeout = '5s'`);
      // The real Storage signer checks the target while this transaction holds its table lock.
      // Using the provider table also proves that the issuing request already passed the app check.
      await tx.execute(sql`lock table storage.objects in access exclusive mode`);
      signing.response = requestLegacyCredential(member, origin, claim.id);
      void signing.response.catch(() => {});
      await expect
        .poll(
          async () => {
            const [row] = await tx.execute<{ blocked: boolean }>(sql`
          select exists (
            select 1 from pg_locks
            where relation = 'storage.objects'::regclass and not granted
              and pg_backend_pid() = any(pg_blocking_pids(pid))
          ) as blocked
        `);
            return row.blocked;
          },
          { timeout: 5_000 }
        )
        .toBe(true);
      await tx
        .insert(claimInboundPilotCases)
        .values({ claimId: claim.id, tenantId: claim.tenantId, paused: true });
    });
  } catch (error) {
    await signing.response?.catch(() => null);
    throw error;
  }
  if (!signing.response) throw new Error('No signer request reached local storage');
  return signing.response;
}

export async function proveLegacyCredentialCutover(
  browser: Browser,
  { page: staff, origin, locale }: { page: Page; origin: string; locale: string },
  info: TestInfo
) {
  const storage = requireLocalPilotProof(origin);
  const claim = await createMkCase();
  const control = await createMkCase();
  const context = await openCleanContext(browser, origin);
  try {
    const member = await context.newPage();
    await loginAtDoor(staff, origin, locale, 'MK_STAFF', info);
    await loginAtDoor(member, origin, locale, 'MK_MEMBER', info);
    const { signing, confirmation } = await captureLegacyActions(
      staff,
      origin,
      locale,
      claim,
      info
    );
    await proveEnrollmentReadFailure(staff, origin, control, claim, signing);
    const stale = await readCredential(await closeWhileSigning(member, origin, claim), storage);
    const drainedAt = Date.now();
    expect(stale.expiresAt).toBeLessThanOrEqual(drainedAt + providerLifetimeMs);
    const paused = await requestLegacyCredential(member, origin, claim.id);
    expect(paused.status()).toBe(403);
    expect(Object.keys(await paused.json())).toEqual(['error']);
    await expectLegacyActionClosed(staff, origin, signing);
    await expectLegacyActionClosed(staff, origin, confirmation);
    const before = await listMkObjects(claim);
    expect(before).toHaveLength(1);
    expect(before.some(object => stale.path.endsWith(`/${object.name}`))).toBe(false);
    const multipart = () =>
      staff.request.post(`${origin}/api/claims/evidence-upload`, {
        multipart: { claimId: claim.id, category: 'evidence', locale, file: inboundPdf },
        maxRedirects: 0,
      });
    expect((await multipart()).status()).toBe(403);
    await expect(
      dbAdmin
        .update(claimInboundPilotCases)
        .set({ enrolledAt: new Date() })
        .where(eq(claimInboundPilotCases.claimId, claim.id))
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint_name: 'claim_inbound_pilot_cases_disposition_check' },
    });
    expect(
      (
        await dbAdmin.query.claimInboundPilotCases.findFirst({
          where: eq(claimInboundPilotCases.claimId, claim.id),
        })
      )?.enrolledAt
    ).toBeNull();
    await expectBothDocumentGetsDenied(member, origin, stale.id, [404]);

    // Count from the last possible issuance after draining, using the provider lifetime.
    // The API's expiresIn field describes a separate application contract.
    await delay(drainedAt + providerLifetimeMs + skewMs - Date.now());
    await dbAdmin
      .update(claimInboundPilotCases)
      .set({
        enrolledAt: new Date(),
        legacyCredentialDisposition: 'expired',
        paused: false,
      })
      .where(eq(claimInboundPilotCases.claimId, claim.id));

    // A successful request from the same issuer and provider proves the expired PUT
    // is rejected for the credential rather than an unavailable service or malformed body.
    const fresh = await readCredential(
      await requestLegacyCredential(member, origin, control.id),
      storage
    );
    expect((await directStoragePut(fresh)).ok).toBe(true);
    const uploaded = await createAdminClient().storage.from(fresh.bucket).download(fresh.path);
    if (uploaded.error || !uploaded.data) throw new Error('Missing same-signer control bytes');
    expect(Buffer.from(await uploaded.data.arrayBuffer())).toEqual(inboundPdf.buffer);
    const refused = await directStoragePut(stale);
    expect([400, 401, 403]).toContain(refused.status);
    expect(
      /invalid\s*(jwt|token)|(?:jwt|token)[^"\n]{0,50}expir|expir[^"\n]{0,50}(?:jwt|token)/i.test(
        await refused.text()
      )
    ).toBe(true);
    expect((await listMkObjects(claim)).map(object => object.name)).toEqual(
      before.map(object => object.name)
    );
    const resumed = await readCredential(
      await requestLegacyCredential(member, origin, claim.id),
      storage
    );
    expect(resumed.id).not.toBe(stale.id);
    await expectLegacyActionClosed(staff, origin, signing);
    await expectLegacyActionClosed(staff, origin, confirmation);
    expect((await multipart()).status()).toBe(403);
    expect(await doorDocuments(claim.id)).toHaveLength(0);
    await expectBothDocumentGetsDenied(member, origin, stale.id, [404]);
  } finally {
    await context.close();
  }
}
