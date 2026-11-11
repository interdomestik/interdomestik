import { E2E_DOCUMENT_FIXTURES, E2E_RUNTIME_ROLES, E2E_USERS } from '@interdomestik/database';
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type TestInfo,
} from '@playwright/test';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import {
  catalogueDelivery,
  LOCAL_CONFIGURED_STORAGE_SKIP,
  readSignedObject,
  requireUntracedSignedLane,
} from './catalogue-delivery';
import { isKsGateProject, isMkGateProject } from './gate-project-identity';
import { requireSeededHost, signInAs } from './nine-role-actor';
import {
  DOCUMENT_KEYS,
  KS_DOCUMENT_CASES,
  MK_DOCUMENT_CASES,
  type DocumentActorCases,
} from './nine-role-document-access.cases';
import { getRespectingRateLimit } from './rate-limit-aware-get';

/** An authenticated denial; 401, redirects, rate limits and server errors prove nothing. */
const DENIAL_STATUSES = [403, 404];

type CatalogueDocument = (typeof E2E_DOCUMENT_FIXTURES)[(typeof DOCUMENT_KEYS)[number]];

/** Metadata names the document and hands out the URL its delivery mode serves bytes from. */
async function expectAllowedMetadata(
  info: TestInfo,
  metadata: APIResponse,
  document: CatalogueDocument,
  label: string
) {
  expect(metadata.status(), label).toBe(200);
  const body = (await metadata.json()) as { url?: unknown; name?: unknown; delivery?: unknown };
  expect(body.name, label).toBe(document.name);
  if (catalogueDelivery() === 'authenticated-proxy') {
    expect(body, label).toMatchObject({
      url: `/api/documents/${encodeURIComponent(document.id)}/download`,
      delivery: 'authenticated-proxy',
    });
    return;
  }
  // The signed URL is a live credential: booleans and numbers only, read outside Playwright.
  const signed = typeof body.url === 'string' && URL.canParse(body.url) ? new URL(body.url) : null;
  expect(body.delivery, `${label} delivery`).toBeUndefined();
  expect(signed?.protocol === 'https:', `${label} signed URL is https`).toBe(true);
  const signedPrefix = `/storage/v1/object/sign/${document.bucket}/`;
  expect(signed?.pathname.startsWith(signedPrefix), `${label} signed object path`).toBe(true);
  const stored = await readSignedObject(String(signed), `${label} signed URL bytes`);
  expect(stored.status, `${label} signed URL bytes`).toBe(200);
  expect(stored.byteLength, `${label} signed URL bytes`).toBeGreaterThan(0);
}

async function expectDocumentAccess(
  request: APIRequestContext,
  info: TestInfo,
  key: (typeof DOCUMENT_KEYS)[number],
  allowed: boolean
) {
  const { origin } = getProjectUrlInfo(info, null);
  const document = E2E_DOCUMENT_FIXTURES[key];
  const base = `${origin}/api/documents/${encodeURIComponent(document.id)}`;
  const label = `${key} ${allowed ? 'allowed' : 'denied'}`;
  const read = (url: string) => getRespectingRateLimit(request, info, url, { maxRedirects: 0 });

  const metadata = await read(base);
  const download = await read(`${base}/download`);
  const preview = await read(`${base}/download?disposition=inline`);

  if (allowed) {
    await expectAllowedMetadata(info, metadata, document, label);
    expect(download.status(), label).toBe(200);
    expect((await download.body()).byteLength, label).toBeGreaterThan(0);
    expect(preview.status(), label).toBe(200);
    expect(preview.headers()['content-disposition'], label).toContain('inline');
    expect((await preview.body()).byteLength, label).toBeGreaterThan(0);
    return;
  }
  expect(DENIAL_STATUSES, `${label} metadata ${metadata.status()}`).toContain(metadata.status());
  expect(await metadata.text(), label).not.toContain('/download');
  expect(DENIAL_STATUSES, `${label} download ${download.status()}`).toContain(download.status());
  expect(DENIAL_STATUSES, `${label} preview ${preview.status()}`).toContain(preview.status());
}

function describeActors(project: (name: string) => boolean, cases: readonly DocumentActorCases[]) {
  cases.forEach(({ actor, allowed }, index) => {
    test(`${actor} reads exactly its catalogue documents`, async ({ page }, info) => {
      // Intentional and local only: the external staging journey never takes this skip.
      test.skip(catalogueDelivery() === 'unavailable', LOCAL_CONFIGURED_STORAGE_SKIP);
      requireSeededHost(info, project, 90_000);
      // Before any request: a trace would record the signed URL in the metadata body.
      requireUntracedSignedLane(info.project.use.trace);
      await signInAs(page, info, actor, `10.0.71.${index + 1}`);
      for (const key of DOCUMENT_KEYS) {
        await expectDocumentAccess(page.request, info, key, allowed.includes(key));
      }
    });
  });
}

test.describe('nine-role document access matrix', () => {
  describeActors(isKsGateProject, KS_DOCUMENT_CASES);
  describeActors(isMkGateProject, MK_DOCUMENT_CASES);

  test('covers each of the nine runtime roles with a seeded actor', () => {
    const roles = [...KS_DOCUMENT_CASES, ...MK_DOCUMENT_CASES].map(
      row => E2E_USERS[row.actor].dbRole
    );
    expect(new Set(roles)).toEqual(new Set(E2E_RUNTIME_ROLES));
  });
});
