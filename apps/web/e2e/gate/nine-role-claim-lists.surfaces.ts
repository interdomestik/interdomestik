import { claims, db } from '@interdomestik/database';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import type {
  DeniableSurface,
  ListRow,
  ListSurface,
  OpsFilter,
  OpsRow,
} from './nine-role-claim-lists.cases';
import { collectOpsPages } from './nine-role-ops-pages';

/** Markers each surface renders only after its list read succeeded. */
const READY_MARKERS: Record<ListSurface, string> = {
  staff: 'staff-page-ready',
  admin: 'admin-claims-v2-ready',
  ops: 'ops-center-page',
  agent: 'agent-claims-page',
  workspace: 'agent-claims-pro-page',
  member: 'member-claims-filter-region',
};

const RENDER_ERROR = 'Something went wrong!';

async function caseTitle(caseId: string): Promise<string> {
  const row = await db.query.claims.findFirst({
    where: eq(claims.id, caseId),
    columns: { title: true },
  });
  return row?.title || caseId;
}

async function caseBranchCode(caseId: string): Promise<string> {
  const row = await db.query.claims.findFirst({
    where: eq(claims.id, caseId),
    columns: { id: true },
    with: { branch: { columns: { code: true } } },
  });
  const code = row?.branch?.code;
  if (!code) throw new Error(`Case ${caseId} has no seeded branch code`);
  return code;
}

async function opsQuery(filter: OpsFilter): Promise<URLSearchParams> {
  const query = new URLSearchParams({ view: 'ops' });
  if (filter.branchOf) query.set('branch', await caseBranchCode(filter.branchOf));
  if (filter.assignee) query.set('assignee', `staff:${filter.assignee}`);
  return query;
}

function surfacePath(surface: ListSurface, info: TestInfo, search?: string): string {
  const query = search ? `search=${encodeURIComponent(search)}` : '';
  if (surface === 'staff') return `${routes.staffClaims(info)}?${query}`;
  if (surface === 'admin') return `/admin/claims?${query}`;
  if (surface === 'ops') return '/admin/claims?view=ops';
  if (surface === 'member') return `${routes.memberClaims(info)}?${query}`;
  if (surface === 'workspace') return routes.agentWorkspaceClaims(info);
  return '/agent/claims';
}

/** Searches each surface by a term it indexes and returns the locator for the case's row. */
async function openRow(page: Page, info: TestInfo, surface: ListSurface, caseId: string) {
  const marker = READY_MARKERS[surface];
  const title = await caseTitle(caseId);
  if (surface === 'agent') {
    await gotoApp(page, surfacePath(surface, info), info, { marker });
    const href = `claimId=${encodeURIComponent(caseId)}`;
    return page.locator(`[data-testid="agent-claim-row"][href*="${href}"]`);
  }
  if (surface === 'workspace') {
    await gotoApp(page, surfacePath(surface, info), info, { marker });
    await page.getByTestId('claims-search').filter({ visible: true }).fill(title);
    return page.getByTestId('claim-row').locator(`[title="${title}"]`);
  }
  if (surface === 'member') {
    const read = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/claims' && url.searchParams.get('search') === caseId;
    });
    await gotoApp(page, surfacePath(surface, info, caseId), info, { marker });
    expect((await read).status(), `member read ${caseId}`).toBe(200);
    // The filters render while the table loads; only a settled table or empty result is a read.
    const settled = page
      .getByTestId('member-claims-table-region')
      .or(page.getByTestId('member-claims-empty'));
    await expect(settled.filter({ visible: true }), `member read ${caseId} settled`).toBeVisible();
    return page.locator(`a[href$="/member/claims/${caseId}"]`);
  }
  if (surface === 'staff') {
    await gotoApp(page, surfacePath(surface, info, title), info, { marker });
    return page.getByTestId('staff-claim-title').and(page.getByText(title, { exact: true }));
  }
  await gotoApp(page, surfacePath(surface, info, caseId), info, { marker });
  // A failed admin read keeps the ready marker but renders recovery instead of rows.
  await expect(page.getByTestId('admin-claims-read-recovery')).toHaveCount(0);
  const result = page.getByTestId('admin-claims-read-result').filter({ visible: true });
  await expect(result).not.toHaveText('');
  return page.locator(`a[data-testid="view-claim"][href$="/admin/claims/${caseId}"]`);
}

export async function expectListRow(page: Page, info: TestInfo, row: ListRow) {
  const [surface, caseId, listed] = row;
  const label = `${surface} list ${caseId}`;
  // Navigation can keep an earlier render hidden in the DOM; only the visible list counts.
  const hit: Locator = (await openRow(page, info, surface, caseId)).filter({ visible: true });
  await expect(page.getByTestId('not-found-page'), label).toHaveCount(0);
  await expect(hit, label).toHaveCount(listed ? 1 : 0);
}

/** Reads every page of the filtered ops view and returns the listed case ids. */
async function readOpsCaseIds(page: Page, info: TestInfo, filter: OpsFilter): Promise<string[]> {
  const query = await opsQuery(filter);
  return collectOpsPages(async index => {
    query.set('page', String(index));
    await gotoApp(page, `/admin/claims?${query}`, info, { marker: READY_MARKERS.ops });
    await expect(page.getByTestId('not-found-page')).toHaveCount(0);
    const cards = page.locator('a[data-testid="claim-operational-card"]').filter({ visible: true });
    const hrefs = await cards.evaluateAll(links => links.map(link => link.getAttribute('href')));
    const more = page.getByTestId('load-more-button').filter({ visible: true });
    return { ids: hrefs.map(href => href?.split('/').pop() ?? ''), more: (await more.count()) > 0 };
  });
}

export async function expectOpsRow(page: Page, info: TestInfo, row: OpsRow) {
  const [filter, caseId, listed, control] = row;
  const label = `ops ${JSON.stringify(filter)} ${caseId}`;
  const ids = await readOpsCaseIds(page, info, filter);
  // A failed ops read renders an empty view, so the control case proves the read succeeded.
  expect(ids, `${label} control ${control}`).toContain(control);
  expect(
    ids.filter(id => id === caseId),
    label
  ).toHaveLength(listed ? 1 : 0);
}

export async function expectSurfaceDenied(page: Page, info: TestInfo, surface: DeniableSurface) {
  const label = `${surface} list denied`;
  await gotoApp(page, surfacePath(surface, info), info, { marker: 'not-found-page' });
  // The locale error boundary reuses the not-found marker; a render failure is not a denial.
  const notFound = page.locator('[data-testid="not-found-page"]:visible');
  await expect(notFound, label).toBeVisible();
  await expect(notFound, label).not.toContainText(RENDER_ERROR);
  await expect(page.getByTestId(READY_MARKERS[surface]), label).toHaveCount(0);
}
