import {
  claims,
  db,
  E2E_RELATIONSHIP_FIXTURES,
  E2E_USER_IDS,
  E2E_USERS,
  type E2EUserKey,
} from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { isKsGateProject } from './gate-project-identity';
import { requireSeededHost, signInAs } from './nine-role-actor';
import {
  API_PROBE_CASES,
  KS_API_ACTORS,
  KS_LIST_CASES,
  MK_API_ACTORS,
  MK_LIST_CASES,
  type ListActorCases,
} from './nine-role-claim-lists.cases';
import { expectListRow, expectOpsRow, expectSurfaceDenied } from './nine-role-claim-lists.surfaces';
import { collectOpsPages, type OpsPage } from './nine-role-ops-pages';

const isMkGateProject = (name: string) => name === 'gate-mk-mk';
const OWNERSHIP = E2E_RELATIONSHIP_FIXTURES.MEMBER_OWNERSHIP;
/** /api/claims serves fixed pages of this size. */
const API_PAGE_SIZE = 10;
const STATUS_BUCKETS = ['active', 'draft', 'closed'] as const;

type ApiPage = {
  claims: { id: string }[];
  totalCount: number;
  totalPages: number;
  totals: Record<(typeof STATUS_BUCKETS)[number], number>;
};

function describeLists(project: (name: string) => boolean, cases: readonly ListActorCases[]) {
  cases.forEach(({ actor, rows, opsRows = [], deniedSurfaces }, index) => {
    test(`${actor} claim lists and search match the current runtime rules`, async ({
      page,
    }, info) => {
      requireSeededHost(info, project, 180_000);
      await signInAs(page, info, actor, `10.0.71.${index + 1}`);
      for (const surface of deniedSurfaces) await expectSurfaceDenied(page, info, surface);
      for (const row of rows) await expectListRow(page, info, row);
      for (const row of opsRows) await expectOpsRow(page, info, row);
    });
  });
}

async function readApi(page: Page, info: TestInfo, ip: string, query: Record<string, string>) {
  const url = new URL('/api/claims', getProjectUrlInfo(info, null).origin);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await page.request.get(url.toString(), {
    headers: { ...info.project.use.extraHTTPHeaders, 'x-forwarded-for': ip },
  });
  expect(response.status(), url.search).toBe(200);
  return (await response.json()) as ApiPage;
}

/** Walks every page so pagination cannot hide or repeat a claim, and checks the page count. */
async function readAllApi(page: Page, info: TestInfo, ip: string, query = {}) {
  const first = await readApi(page, info, ip, { ...query, page: '1' });
  const ids = first.claims.map(claim => claim.id);
  for (let next = 2; next <= first.totalPages; next++) {
    const body = await readApi(page, info, ip, { ...query, page: String(next) });
    ids.push(...body.claims.map(claim => claim.id));
  }
  const label = JSON.stringify(query);
  expect(new Set(ids).size, `${label} unique`).toBe(ids.length);
  expect(first.totalCount, `${label} total`).toBe(ids.length);
  expect(first.totalPages, `${label} pages`).toBe(Math.ceil(ids.length / API_PAGE_SIZE));
  const beyond = await readApi(page, info, ip, { ...query, page: String(first.totalPages + 1) });
  expect(beyond.claims, `${label} beyond last page`).toEqual([]);
  return { ids, first };
}

async function ownedClaimIds(actor: E2EUserKey): Promise<string[]> {
  const rows = await db.query.claims.findMany({
    where: and(
      eq(claims.tenantId, E2E_USERS[actor].tenantId),
      eq(claims.userId, E2E_USER_IDS[actor])
    ),
    columns: { id: true },
  });
  return rows.map(row => row.id).sort((a, b) => a.localeCompare(b));
}

const sorted = (ids: string[]) => [...ids].sort((a, b) => a.localeCompare(b));

async function expectApiOwnership(page: Page, info: TestInfo, actor: E2EUserKey, ip: string) {
  const owned = await ownedClaimIds(actor);
  const { ids, first } = await readAllApi(page, info, ip);
  expect(sorted(ids), `${actor} rows`).toEqual(owned);
  if (actor === OWNERSHIP.allowedActor) {
    expect(ids).toContain(OWNERSHIP.caseId);
    expect(ids).not.toContain(OWNERSHIP.deniedCaseId);
  }

  // Each facet equals the owned rows its status filter returns.
  for (const status of STATUS_BUCKETS) {
    const bucket = await readAllApi(page, info, ip, { status });
    expect(owned, `${actor} ${status} rows are owned`).toEqual(expect.arrayContaining(bucket.ids));
    expect(first.totals[status], `${actor} ${status} facet`).toBe(bucket.ids.length);
  }

  for (const caseId of API_PROBE_CASES) {
    const search = await readAllApi(page, info, ip, { search: caseId });
    expect(search.ids, `${actor} search ${caseId}`).toEqual(
      owned.filter(id => id.includes(caseId))
    );
  }

  // Caller-supplied scope, identity and tenant parameters must not widen or redirect the list.
  const tampered = await readAllApi(page, info, ip, {
    scope: 'all',
    role: 'super_admin',
    tenantId: E2E_USERS[actor].tenantId === 'tenant_ks' ? 'tenant_mk' : 'tenant_ks',
    userId: E2E_USER_IDS.KS_MEMBER,
    branchId: 'ks_branch_b',
  });
  expect(sorted(tampered.ids), `${actor} tampered rows`).toEqual(owned);
}

function describeApi(project: (name: string) => boolean, actors: readonly E2EUserKey[]) {
  actors.forEach((actor, index) => {
    test(`${actor} member claims API lists only claims it owns`, async ({ page }, info) => {
      requireSeededHost(info, project, 120_000);
      const ip = `10.0.72.${index + 1}`;
      await signInAs(page, info, actor, ip);
      await expectApiOwnership(page, info, actor, ip);
    });
  });
}

test.describe('nine-role claim list matrix', () => {
  describeLists(isKsGateProject, KS_LIST_CASES);
  describeLists(isMkGateProject, MK_LIST_CASES);
  describeApi(isKsGateProject, KS_API_ACTORS);
  describeApi(isMkGateProject, MK_API_ACTORS);

  test('ops page walk fails when an offered page lists no claims', async () => {
    const walk = (pages: OpsPage[]) => collectOpsPages(async index => pages[index]);
    const control = { ids: ['control'], more: true };
    // A failed later read renders like the last page; it must not end the walk as complete.
    await expect(walk([control, { ids: [], more: false }])).rejects.toThrow('ops page 1');
    await expect(walk([control, { ids: ['later'], more: false }])).resolves.toEqual([
      'control',
      'later',
    ]);
    await expect(walk([{ ids: [], more: false }])).resolves.toEqual([]);
  });
});
