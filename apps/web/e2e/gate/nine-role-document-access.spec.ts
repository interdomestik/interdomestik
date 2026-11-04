import { E2E_DOCUMENT_FIXTURES, E2E_RUNTIME_ROLES, E2E_USERS } from '@interdomestik/database';
import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { isKsGateProject } from './gate-project-identity';
import { requireSeededHost, signInAs } from './nine-role-actor';
import {
  DOCUMENT_KEYS,
  KS_DOCUMENT_CASES,
  MK_DOCUMENT_CASES,
  type DocumentActorCases,
} from './nine-role-document-access.cases';

/** An authenticated denial; 401, redirects, rate limits and server errors prove nothing. */
const DENIAL_STATUSES = [403, 404];

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

  const metadata = await request.get(base, { maxRedirects: 0 });
  const download = await request.get(`${base}/download`, { maxRedirects: 0 });

  if (allowed) {
    expect(metadata.status(), label).toBe(200);
    expect(await metadata.json(), label).toMatchObject({
      url: `/api/documents/${encodeURIComponent(document.id)}/download`,
      name: document.name,
      delivery: 'authenticated-proxy',
    });
    expect(download.status(), label).toBe(200);
    expect((await download.body()).byteLength, label).toBeGreaterThan(0);
    return;
  }
  expect(DENIAL_STATUSES, `${label} metadata ${metadata.status()}`).toContain(metadata.status());
  expect(await metadata.text(), label).not.toContain('/download');
  expect(DENIAL_STATUSES, `${label} download ${download.status()}`).toContain(download.status());
}

function describeActors(project: (name: string) => boolean, cases: readonly DocumentActorCases[]) {
  cases.forEach(({ actor, allowed }, index) => {
    test(`${actor} reads exactly its catalogue documents`, async ({ page }, info) => {
      requireSeededHost(info, project, 90_000);
      await signInAs(page, info, actor, `10.0.71.${index + 1}`);
      for (const key of DOCUMENT_KEYS) {
        await expectDocumentAccess(page.request, info, key, allowed.includes(key));
      }
    });
  });
}

test.describe('nine-role document access matrix', () => {
  describeActors(isKsGateProject, KS_DOCUMENT_CASES);
  describeActors(name => name === 'gate-mk-mk', MK_DOCUMENT_CASES);

  test('covers each of the nine runtime roles with a seeded actor', () => {
    const roles = [...KS_DOCUMENT_CASES, ...MK_DOCUMENT_CASES].map(
      row => E2E_USERS[row.actor].dbRole
    );
    expect(new Set(roles)).toEqual(new Set(E2E_RUNTIME_ROLES));
  });
});
