import {
  claims,
  db,
  E2E_MESSAGE_FIXTURES,
  E2E_RELATIONSHIP_FIXTURES,
} from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { isKsGateProject } from './gate-project-identity';
import { requireSeededHost, signInAs } from './nine-role-actor';
import {
  CASE_TITLES,
  KS_ACTOR_CASES,
  MK_ACTOR_CASES,
  type AccessRow,
  type ActorCases,
} from './nine-role-claim-access.cases';

const ALLOWED_MARKERS = {
  member: 'member-claim-detail-page',
  staff: 'staff-claim-detail-ready',
  admin: 'admin-page-ready',
  agent: 'agent-claims-pro-page',
} as const;

const RENDER_ERROR = 'Something went wrong!';

async function staffReference(caseId: string): Promise<string> {
  const row = await db.query.claims.findFirst({
    where: eq(claims.id, caseId),
    columns: { claimNumber: true },
  });
  return row?.claimNumber || caseId;
}

function claimPath([surface, caseId]: AccessRow, info: TestInfo): string {
  if (surface === 'member') return routes.memberClaimDetail(caseId, info);
  if (surface === 'staff') return routes.staffClaimDetail(caseId, info);
  if (surface === 'admin') return `/admin/claims/${encodeURIComponent(caseId)}`;
  return `${routes.agentWorkspaceClaims(info)}?claimId=${encodeURIComponent(caseId)}`;
}

async function expectRow(page: Page, info: TestInfo, row: AccessRow) {
  const [surface, caseId, allowed] = row;
  const label = `${surface} ${caseId}`;
  const title = CASE_TITLES[caseId];
  const body = page.locator('body');
  if (surface === 'agent') {
    await gotoApp(page, claimPath(row, info), info, { marker: ALLOWED_MARKERS.agent });
    const selected = page.getByTestId('workspace-selected-claim-id');
    if (allowed) {
      await expect(selected, label).toHaveText(caseId);
    } else {
      await expect(page.getByTestId('workspace-claim-not-accessible').first(), label).toBeVisible();
      await expect(selected, label).toHaveCount(0);
      await expect(page.getByTestId('ops-drawer-content'), label).toHaveCount(0);
      await expect(body, label).not.toContainText(title);
    }
    return;
  }
  const marker = allowed ? ALLOWED_MARKERS[surface] : 'not-found-page';
  await gotoApp(page, claimPath(row, info), info, { marker });
  // The staff workspace shows the case reference (claim number or id), not the title. It renders
  // the reference heading twice, so the allowed check reads the first one.
  const reference = page.getByTestId('staff-claim-workspace-reference');
  if (allowed) {
    await expect(page.getByTestId('not-found-page'), label).toHaveCount(0);
    if (surface === 'staff')
      await expect(reference.first(), label).toHaveText(await staffReference(caseId));
    else await expect(body, label).toContainText(title);
  } else {
    // The locale error boundary reuses the not-found marker; a render failure is not a denial.
    const notFound = page.locator('[data-testid="not-found-page"]:visible');
    await expect(notFound, label).toBeVisible();
    await expect(notFound, label).not.toContainText(RENDER_ERROR);
    await expect(reference, label).toHaveCount(0);
    await expect(body, label).not.toContainText(title);
  }
}

function describeActors(project: (name: string) => boolean, cases: readonly ActorCases[]) {
  cases.forEach(({ actor, rows }, index) => {
    test(`${actor} claim detail access matches the current runtime rules`, async ({
      page,
    }, info) => {
      requireSeededHost(info, project, 120_000);
      await signInAs(page, info, actor, `10.0.70.${index + 1}`);
      for (const row of rows) await expectRow(page, info, row);
    });
  });
}

test.describe('nine-role claim access matrix', () => {
  describeActors(isKsGateProject, KS_ACTOR_CASES);
  describeActors(name => name === 'gate-mk-mk', MK_ACTOR_CASES);

  test('internal messages reach staff but never the owning member', async ({ page }, info) => {
    requireSeededHost(info, isKsGateProject, 90_000);
    const { allowedActor, deniedActor, caseId } =
      E2E_RELATIONSHIP_FIXTURES.INTERNAL_MESSAGE_VISIBILITY;
    const { KS_ANCHOR_PUBLIC: publicMessage, KS_ANCHOR_INTERNAL: internalMessage } =
      E2E_MESSAGE_FIXTURES;

    await signInAs(page, info, allowedActor, '10.0.70.101');
    await gotoApp(page, routes.staffClaimDetail(caseId, info), info, {
      marker: ALLOWED_MARKERS.staff,
    });
    await expect(page.getByText(publicMessage.content).first()).toBeVisible();
    await expect(page.getByText(internalMessage.content).first()).toBeVisible();

    await signInAs(page, info, deniedActor, '10.0.70.102');
    await gotoApp(page, routes.memberClaimDetail(caseId, info), info, {
      marker: 'member-claim-detail-messaging',
    });
    await expect(page.getByText(publicMessage.content).first()).toBeVisible();
    await expect(page.getByText(internalMessage.content)).toHaveCount(0);
  });
});
